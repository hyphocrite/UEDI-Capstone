const AuditLog = require("../models/AuditLog");

// Writes an audit log entry for every API request that changes something (POST, PUT, PATCH,
// DELETE), once the response is sent, so the entry has the outcome. A route adds context with
// auditNote(res, { action, target, before, details, user }).

// Method, path pattern and the action shown to administrators. First match wins.
const ACTIONS = [
  ["POST", /^\/api\/auth\/register$/, "Account created"],
  ["POST", /^\/api\/auth\/verify-email$/, "Email verified"],
  ["POST", /^\/api\/auth\/resend-verification$/, "Verification code resent"],
  ["POST", /^\/api\/auth\/login$/, "Signed in"],
  ["POST", /^\/api\/auth\/logout$/, "Signed out"],
  ["POST", /^\/api\/auth\/refresh$/, "Stayed signed in"],
  ["PATCH", /^\/api\/auth\/profile$/, "Profile updated"],
  ["POST", /^\/api\/auth\/password$/, "Password changed"],
  ["PATCH", /^\/api\/auth\/users\/[^/]+\/member$/, "Account linked to member"],
  ["PATCH", /^\/api\/auth\/users\/[^/]+\/role$/, "Role changed"],
  ["POST", /^\/api\/applications$/, "Application submitted"],
  ["POST", /^\/api\/applications\/[^/]+\/assess$/, "Models run again"],
  ["PUT", /^\/api\/applications\/[^/]+\/documents\/\d+$/, "Document uploaded"],
  ["POST", /^\/api\/applications\/[^/]+\/approvals$/, "Application signed"],
  ["POST", /^\/api\/loans\/[^/]+\/release$/, "Loan released"],
  ["POST", /^\/api\/loans\/[^/]+\/payments\/[^/]+\/void$/, "Payment voided"],
  ["POST", /^\/api\/loans\/[^/]+\/payments$/, "Payment recorded"],
  ["POST", /^\/api\/deductions$/, "Deduction run started"],
  ["PATCH", /^\/api\/deductions\/[^/]+\/lines\/[^/]+$/, "Deduction line changed"],
  ["POST", /^\/api\/deductions\/[^/]+\/send$/, "Deduction run sent to payroll"],
  ["PUT", /^\/api\/deductions\/[^/]+\/remittance$/, "Remittance saved"],
  ["POST", /^\/api\/deductions\/[^/]+\/import$/, "Remittance file read"],
  ["POST", /^\/api\/deductions\/[^/]+\/post$/, "Deduction run posted"],
  ["POST", /^\/api\/deductions\/[^/]+\/unpost$/, "Deduction run unposted"],
  ["POST", /^\/api\/members$/, "Member added"],
  ["POST", /^\/api\/members\/[^/]+\/payroll-deduction$/, "Payroll deduction set up"],
  ["PATCH", /^\/api\/members\/[^/]+$/, "Member edited"],
  ["POST", /^\/api\/retirement-plans$/, "Retirement plan opened"],
  ["POST", /^\/api\/retirement-plans\/[^/]+\/contributions\/[^/]+\/void$/, "Contribution voided"],
  ["POST", /^\/api\/retirement-plans\/[^/]+\/contributions$/, "Contribution recorded"],
  ["PUT", /^\/api\/settings$/, "Loan settings changed"],
  ["POST", /^\/api\/member\/register$/, "Account created (mobile)"],
  ["POST", /^\/api\/member\/verify-email$/, "Email verified (mobile)"],
  ["POST", /^\/api\/member\/resend-verification$/, "Verification code resent (mobile)"],
  ["POST", /^\/api\/member\/login$/, "Signed in (mobile)"],
  ["POST", /^\/api\/member\/applications$/, "Application submitted (mobile)"],
];

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SECRET = /password|code|token|secret/i;

/** The request body with secrets removed and big values cut short, safe to keep. */
function scrub(value, depth = 0) {
  if (Buffer.isBuffer(value)) return `[file, ${value.length} bytes]`;
  if (value == null || typeof value !== "object") {
    return typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}… (${value.length} characters)` : value;
  }
  if (depth > 4) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((v) => scrub(v, depth + 1));
    return value.length > 20 ? [...items, `… ${value.length - 20} more`] : items;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET.test(k) ? "[removed]" : scrub(v, depth + 1);
  return out;
}

/** Adds context to this request's audit entry: a more precise action, the record, values before the change. */
function auditNote(res, extra) {
  res.locals.audit = { ...res.locals.audit, ...extra };
}

function audit(req, res, next) {
  if (!MUTATING.has(req.method) || !req.path.startsWith("/api/")) return next();
  const path = req.originalUrl.split("?")[0];
  // Who made the request, as they were before it (a profile edit renames them).
  const actor = req.user && { _id: req.user._id, fullName: req.user.fullName, email: req.user.email, role: req.user.role };
  const action = ACTIONS.find(([m, re]) => m === req.method && re.test(path))?.[2] ?? `${req.method} ${path}`;
  // Keep the error message the route sends back, for failed actions.
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body.error === "string") res.locals.auditError = body.error;
    return json(body);
  };
  res.on("finish", () => {
    const extra = res.locals.audit || {};
    // After sign-in or verification the user is known from the route, before that from the body.
    const user = actor || extra.user;
    const typedEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : undefined;
    AuditLog.create({
      user: user?._id,
      userName: user?.fullName,
      userEmail: user?.email || typedEmail,
      role: user?.role,
      action: extra.action || action,
      target: extra.target,
      method: req.method,
      path,
      details: scrub(extra.details ?? req.body ?? {}),
      before: extra.before === undefined ? undefined : scrub(extra.before),
      status: res.statusCode,
      ok: res.statusCode < 400,
      error: res.locals.auditError,
      ip: req.ip,
      client: req.get("authorization")?.startsWith("Bearer ") || path.startsWith("/api/member/") ? "mobile" : "web",
    }).catch((err) => console.error("Could not write the audit log:", err.message));
  });
  next();
}

module.exports = { audit, auditNote, scrub, ACTIONS };
