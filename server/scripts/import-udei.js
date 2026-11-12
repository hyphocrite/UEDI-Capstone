// Loads UDEI's own spreadsheets into the database: members, the loan balances carried over from
// the bookkeeper's ledger, the 2026 loan payments and releases (for Reports), and retirement plan
// contributions. Safe to run again: it replaces what an earlier import wrote and leaves alone
// anything staff typed in (member names, contact details, contributions entered by hand).
//
//   npm --prefix server run import:udei -- "UDEI LOANS-2026.xlsx" "UDEI CONTRIBUTIONS 2026.xlsx"
//   npm --prefix server run import:udei -- --dry-run "UDEI LOANS-2026.xlsx" "UDEI CONTRIBUTIONS 2026.xlsx"
//
// It uses MONGODB_URI from server/.env, so point that at Atlas to load the hosted database.
// The spreadsheets hold members' financial records: keep them out of git.
// No names are read: the ledger lists members by UDEI number, and the few blocks headed with a
// name instead are counted in the report totals without a member.
const path = require("node:path");
const ExcelJS = require("exceljs");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A cell's value: formula results unwrapped, errors such as #REF! as null. */
function val(cell) {
  let v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) v = v.result;
    else if ("richText" in v) v = v.richText.map((t) => t.text).join("");
    else if ("error" in v) v = null;
    else if ("text" in v) v = v.text;
  }
  if (v && typeof v === "object" && !(v instanceof Date) && "error" in v) return null;
  return v ?? null;
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);
const cents = (v) => Math.round(num(v) * 100);
const text = (v) => (v == null ? "" : String(v).trim());
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const lastDay = (y, m) => utc(y, m + 1, 0);
const iso = (d) => d.toISOString().slice(0, 10);

/** Membership dates come as real dates or text such as "1/2006", "1/6/2025" or "2014". */
function membershipDate(v) {
  if (v instanceof Date) return utc(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  const s = text(v);
  let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return utc(+m[3], +m[1] - 1, +m[2]);
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/))) return utc(+m[2], +m[1] - 1, 1);
  if ((m = s.match(/^(\d{4})$/))) return utc(+m[1], 0, 1);
  return null;
}

/** "as of September 30, 2026" in the first rows of the SUMMARY sheet. */
function asOfDate(ws) {
  for (let r = 1; r <= 6; r++) {
    const m = text(val(ws.getCell(r, 1))).match(/as of\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
    if (m) return utc(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2]);
  }
  return null;
}

const memberKey = (v) => {
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  const s = text(v);
  return /^(\d+|S-\d+)$/i.test(s) ? s.toUpperCase() : null;
};

function readLoans(wb) {
  const ws = wb.getWorksheet("SUMMARY");
  if (!ws) throw new Error('The loans file has no "SUMMARY" sheet.');
  const asOf = asOfDate(ws);
  if (!asOf) throw new Error('Could not find "as of <date>" at the top of the SUMMARY sheet.');
  const year = asOf.getUTCFullYear();
  const members = new Map();
  ws.eachRow((row) => {
    const id = memberKey(val(row.getCell(1)));
    if (!id) return;
    members.set(id, {
      remarks: text(val(row.getCell(4))),
      openingLoan: {
        asOf,
        balanceStartOfYear: cents(val(row.getCell(3))),
        appliedThisYear: cents(val(row.getCell(5))),
        payments: cents(val(row.getCell(6))),
        interest: cents(val(row.getCell(9))),
        balance: cents(val(row.getCell(10))),
        loansThisYear: 0,
      },
    });
  });

  // INDIV. LEDGER: one block per loan, headed "Name: | UDEI No. 6", then a row per month.
  // Columns: A month, C DV#/OR# reference, D payment, E 1% service fee, I principal released.
  const history = [];
  const led = wb.getWorksheet("INDIV. LEDGER");
  if (led) {
    let memberId;
    let inBlock = false;
    let monthIdx = -1;
    let blockYear = year;
    led.eachRow((row) => {
      const a = text(val(row.getCell(1)));
      if (/^name:?$/i.test(a)) {
        const m = text(val(row.getCell(2))).match(/UDEI\s*No\.?\s*([A-Za-z0-9-]+)/i);
        memberId = m ? m[1].toUpperCase() : undefined; // a block headed with a name: no member
        inBlock = true;
        monthIdx = -1;
        blockYear = year;
        return;
      }
      if (!inBlock) return;
      if (/^total/i.test(a)) {
        inBlock = false;
        return;
      }
      if (/\(beg\)/i.test(a)) return; // the balance carried in, not a transaction
      const mi = MONTHS.indexOf(a.toLowerCase());
      if (mi >= 0) {
        if (mi < monthIdx) blockYear += 1; // "January" again after December
        monthIdx = mi;
      }
      if (monthIdx < 0) return;
      const ref = text(val(row.getCell(3)));
      // Use the day from a reference such as "OR#00070 5/25/2026" when it is in this month.
      let date = lastDay(blockYear, monthIdx);
      const d = ref.match(/(\d{1,2})\/(\d{1,2})-?\/(\d{4})/);
      if (d && +d[1] - 1 === monthIdx) date = utc(blockYear, monthIdx, +d[2]);
      if (date > asOf) return;
      const payment = cents(val(row.getCell(4)));
      const fee = cents(val(row.getCell(5)));
      const released = cents(val(row.getCell(9)));
      const reference = ref.slice(0, 80) || undefined;
      if (payment > 0) history.push({ memberId, kind: "payment", date, amount: payment, serviceFee: fee, reference });
      if (released > 0) {
        history.push({ memberId, kind: "release", date, amount: released, reference });
        if (memberId && members.has(memberId)) members.get(memberId).openingLoan.loansThisYear += 1;
      }
    });
  }
  return { asOf, members, history };
}

function readContributions(wb) {
  const ws = wb.worksheets[0];
  // The header row starts with "UDEI MemberNo."; months run in (Ret. Plan, Monthly Dues) pairs from column F.
  let headerRow = 0;
  let year = null;
  ws.eachRow((row, r) => {
    const a = text(val(row.getCell(1)));
    if (!headerRow && /member\s*no/i.test(a)) headerRow = r;
    if (!year && headerRow === 0 && /^\d{4}$/.test(a)) year = +a;
  });
  if (!headerRow) throw new Error('The contributions file has no "UDEI MemberNo." header row.');
  year = year || new Date().getUTCFullYear();
  const plans = new Map();
  ws.eachRow((row, r) => {
    if (r <= headerRow) return;
    const id = memberKey(val(row.getCell(1)));
    if (!id) return;
    const contributions = [];
    for (let m = 0; m < 12; m++) {
      const plan = cents(val(row.getCell(6 + 2 * m)));
      const dues = cents(val(row.getCell(7 + 2 * m)));
      if (plan > 0 || dues > 0) {
        contributions.push({
          month: `${year}-${String(m + 1).padStart(2, "0")}`,
          amount: plan,
          dues,
          paidAt: lastDay(year, m),
          method: "payroll",
          reference: "UDEI contributions spreadsheet",
          source: "import",
          recordedByName: "Spreadsheet import",
        });
      }
    }
    const shares = contributions.map((c) => c.amount);
    const usual = shares.sort((x, y) => shares.filter((s) => s === y).length - shares.filter((s) => s === x).length)[0];
    const monthly = cents(val(row.getCell(5)));
    plans.set(id, {
      joinedAt: membershipDate(val(row.getCell(2))),
      status: text(val(row.getCell(4))),
      openingBalance: Math.max(0, cents(val(row.getCell(3)))),
      openingAsOf: utc(year - 1, 11, 31),
      monthlyContribution: monthly,
      planShare: usual ?? Math.max(0, monthly - 10000), // most months: total minus ₱100 dues
      contributions,
    });
  });
  return { year, plans };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length !== 2) {
    console.error('Usage: npm --prefix server run import:udei -- [--dry-run] "UDEI LOANS-2026.xlsx" "UDEI CONTRIBUTIONS 2026.xlsx"');
    process.exit(1);
  }
  const books = [];
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(f));
    books.push(wb);
  }
  // Either order: the loans file is the one with a SUMMARY sheet.
  const loanBook = books.find((b) => b.getWorksheet("SUMMARY"));
  const contribBook = books.find((b) => b !== loanBook);
  if (!loanBook || !contribBook) throw new Error("Give the loans file (with a SUMMARY sheet) and the contributions file.");

  const loans = readLoans(loanBook);
  const contrib = readContributions(contribBook);
  const source = "udei-spreadsheets";
  const ids = [...new Set([...loans.members.keys(), ...contrib.plans.keys()])];

  const peso = (c) => `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
  const pays = loans.history.filter((h) => h.kind === "payment");
  const rels = loans.history.filter((h) => h.kind === "release");
  console.log(`Loans ledger as of ${iso(loans.asOf)}; contributions for ${contrib.year}.`);
  console.log(`Members: ${ids.length} (${loans.members.size} in the loan summary, ${contrib.plans.size} in contributions).`);
  console.log(`Carried-over loan balances: ${peso(sum([...loans.members.values()], (m) => m.openingLoan.balance))} (summary sheet).`);
  console.log(`Ledger payments: ${pays.length} totalling ${peso(sum(pays, (h) => h.amount))}; summary says ${peso(sum([...loans.members.values()], (m) => m.openingLoan.payments))}.`);
  console.log(`Ledger releases: ${rels.length} totalling ${peso(sum(rels, (h) => h.amount))}; summary says ${peso(sum([...loans.members.values()], (m) => m.openingLoan.appliedThisYear))}.`);
  console.log(`Entries without a member number (name-headed blocks): ${loans.history.filter((h) => !h.memberId).length}.`);
  const allContrib = [...contrib.plans.values()].flatMap((p) => p.contributions);
  console.log(`Retirement plans: ${contrib.plans.size}, ${allContrib.length} monthly contributions, ${peso(sum(allContrib, (c) => c.amount))} to plans + ${peso(sum(allContrib, (c) => c.dues))} dues.`);
  if (dryRun) return console.log("\nDry run: nothing was written.");

  const mongoose = require("mongoose");
  const { connectDb } = require("../src/config/db");
  const Member = require("../src/models/Member");
  const RetirementPlan = require("../src/models/RetirementPlan");
  const LedgerHistory = require("../src/models/LedgerHistory");
  await connectDb();

  for (const id of ids) {
    const l = loans.members.get(id);
    const c = contrib.plans.get(id);
    const remarks = [l?.remarks, /in-?active/i.test(c?.status || "") ? c.status : ""].filter(Boolean);
    if (/^S-/.test(id) && !remarks.some((r) => /separated/i.test(r))) remarks.push("Separated");
    const inactive = /^S-/.test(id) || remarks.some((r) => /separated|in-?active/i.test(r));
    const set = { status: inactive ? "inactive" : "active", remarks: remarks.join("; ") || undefined };
    if (l) set.openingLoan = l.openingLoan;
    if (c?.joinedAt) set.joinedAt = c.joinedAt;
    await Member.updateOne(
      { memberId: id },
      { $set: set, $setOnInsert: { memberId: id, fullName: `Member No. ${id}`, createdByName: "Spreadsheet import" } },
      { upsert: true, runValidators: true },
    );
  }

  for (const [id, c] of contrib.plans) {
    const member = await Member.findOne({ memberId: id });
    const existing = await RetirementPlan.findOne({ memberId: id });
    const keep = existing ? existing.contributions.filter((x) => x.source !== "import") : [];
    const months = new Set(keep.filter((x) => !x.voided).map((x) => x.month));
    const fields = {
      memberName: member.fullName,
      startDate: c.joinedAt || utc(contrib.year, 0, 1),
      monthlyContribution: c.monthlyContribution,
      planShare: Math.min(c.planShare, c.monthlyContribution),
      openingBalance: c.openingBalance,
      openingAsOf: c.openingAsOf,
      contributions: [...keep, ...c.contributions.filter((x) => !months.has(x.month))],
    };
    if (existing) {
      existing.set(fields);
      await existing.save();
    } else {
      await RetirementPlan.create({ memberId: id, createdByName: "Spreadsheet import", ...fields });
    }
  }

  await LedgerHistory.deleteMany({ source });
  await LedgerHistory.insertMany(loans.history.map((h) => ({ ...h, source })));

  console.log("\nImported. Open Members, Retirement Plans and Reports to check the figures.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
