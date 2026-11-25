// Reading DNSC Accounting's remittance list (Excel or CSV): everyone deducted on a cutoff. The
// Bookkeeper uploads it on a sent run; each row is matched to a run line and the remitted amounts are
// shown for review before anything is saved (routes/deductions.js). Plain functions except
// readWorkbook, which uses exceljs.
//
// Accounting's list has no loan numbers, so rows are matched by loan no. → UDEI member no. →
// employee no. → name. The header words live in HEADER_WORDS: when UDEI's real sample arrives,
// adjust them there.
const ExcelJS = require("exceljs");
const { parseCsv, parseAmount, activeLines } = require("./deductions");

/** Words that identify each column, matched case-insensitively against the header cells. */
const HEADER_WORDS = {
  // Identifier columns, in the order rows are matched.
  loanNo: ["loan no", "loan number", "ma no", "ma number"],
  memberNo: ["udei no", "udei number", "member no", "member number", "member id"],
  employeeNo: ["employee no", "employee number", "emp no", "id no", "id number"],
  name: ["name", "employee name", "member name", "full name", "employee"],
  lastName: ["last name", "surname", "family name"],
  firstName: ["first name", "given name"],
  // Amount columns. When there are several (Mutual Assistance and Retirement Plan, say) the
  // Bookkeeper picks one; until then the first match in this order is suggested.
  amount: ["remitted", "mutual assistance", "ma", "loan", "deduction", "amount", "total"],
};
const ID_KEYS = ["loanNo", "memberNo", "employeeNo", "name", "lastName", "firstName"];
const HEADER_SEARCH_ROWS = 15;

class ImportError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** Lowercase, no accents or punctuation, single-spaced: "Employee No." → "employee no". */
const normHeader = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which kind of column a header cell is, or null. Identifier words win ("Loan no." is not an amount). */
function classify(header) {
  const h = normHeader(header);
  if (!h) return null;
  for (const key of ID_KEYS) if (HEADER_WORDS[key].includes(h)) return key;
  const has = (w) => h === w || new RegExp(`(^| )${w}( |$)`).test(h);
  // Exact first, then as whole words inside a longer header ("Mutual Assistance Loan").
  if (HEADER_WORDS.amount.includes(h)) return "amount";
  for (const key of ID_KEYS) if (HEADER_WORDS[key].some((w) => w.includes(" ") && has(w))) return key;
  if (HEADER_WORDS.amount.some(has)) return "amount";
  return null;
}

/** The header row of a sheet: within the first rows, one with an identifier and an amount column. */
function findHeader(rows) {
  for (let i = 0; i < Math.min(HEADER_SEARCH_ROWS, rows.length); i++) {
    const kinds = rows[i].map(classify);
    if (kinds.some((k) => k && k !== "amount") && kinds.includes("amount")) return i;
  }
  return -1;
}

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.result !== undefined) return cellText(v.result); // formula
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
};

/**
 * The sheets of an uploaded file as rows of text cells. Accepts .xlsx and .csv. Old .xls files
 * (Excel 97–2003) can't be read without another library: the message asks for .xlsx or .csv.
 */
async function readWorkbook(buf, fileName = "") {
  const name = fileName.toLowerCase();
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK": .xlsx
  const isOle = buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0; // old binary .xls
  if (isOle || (name.endsWith(".xls") && !isZip)) {
    throw new ImportError("This is an old Excel file (.xls). Open it in Excel and save it as .xlsx (Excel Workbook) or CSV, then upload that.");
  }
  if (isZip) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch {
      throw new ImportError("This Excel file could not be read. Save it again as .xlsx and try once more.");
    }
    return wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cells[c - 1] = cellText(cell.value);
        });
        rows[n - 1] = Array.from(cells, (c) => c ?? "");
      });
      return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) };
    });
  }
  const text = buf.toString("utf8");
  if (/\u0000/.test(text)) throw new ImportError("Upload the remittance list as .xlsx or .csv.");
  return [{ name: fileName.replace(/\.[^.]+$/, "") || "CSV", rows: parseCsv(text) }];
}

// ---- Names ----------------------------------------------------------------------------------

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
/**
 * A name as a set of words, the way matchName (client/src/lib/ocr/matching.ts) compares them: no
 * accents or punctuation, and without middle initials or suffixes. "Dela Cruz, Juan A." and
 * "Juan A. Dela Cruz" give the same words.
 */
function nameWords(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SUFFIXES.has(w));
}

/** 2: the same words. 1: one name's words are all in the other (an extra given name). 0: no match. */
function nameScore(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  const aInB = [...A].every((w) => B.has(w));
  const bInA = [...B].every((w) => A.has(w));
  if (aInB && bInA) return 2;
  if ((aInB && A.size >= 2) || (bInA && B.size >= 2)) return 1;
  return 0;
}

// ---- Matching -------------------------------------------------------------------------------

const key = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/**
 * The review before anything is saved.
 * @param sheets  from readWorkbook
 * @param lines   the run's lines (removed ones are ignored)
 * @param members { memberId, employeeNo } for the run's borrowers, for matching employee numbers
 * @param choice  { sheet, amountColumn, mapping } chosen by the Bookkeeper or remembered in Settings
 */
function preview(sheets, lines, members = [], choice = {}) {
  const live = activeLines(lines);
  const withHeader = sheets.map((s) => ({ ...s, header: findHeader(s.rows) }));
  const usable = withHeader.filter((s) => s.header >= 0);
  if (!usable.length) {
    throw new ImportError(`No header row found in the first ${HEADER_SEARCH_ROWS} rows: the list needs a name or number column and an amount column.`);
  }
  const sheet = usable.find((s) => s.name === choice.sheet) ?? usable[0];
  const header = sheet.rows[sheet.header];

  // Columns: what each header is, the remembered mapping first.
  const columns = header.map((h, index) => ({ index, header: String(h ?? "").trim(), kind: classify(h) }));
  const remembered = choice.mapping || {};
  const colOf = (k) => {
    const byName = remembered[k] && columns.find((c) => normHeader(c.header) === normHeader(remembered[k]));
    return byName ?? columns.find((c) => c.kind === k);
  };
  const ids = Object.fromEntries(ID_KEYS.map((k) => [k, colOf(k)?.index]));
  const amountColumns = columns.filter((c) => c.kind === "amount");
  const wanted = choice.amountColumn ?? remembered.amount;
  const byPriority = [...amountColumns].sort((a, b) => rank(a.header) - rank(b.header))[0];
  const amountCol = amountColumns.find((c) => normHeader(c.header) === normHeader(wanted)) ?? byPriority;

  // Lookups over the run's lines.
  const byLoanNo = new Map(live.map((l) => [key(l.loanNo), l]));
  const byMember = groupBy(live.filter((l) => l.memberId), (l) => key(l.memberId));
  const employeeOf = new Map(members.filter((m) => m.employeeNo).map((m) => [key(m.employeeNo), key(m.memberId)]));
  const lineView = (l) => ({ lineId: String(l._id), loanNo: l.loanNo, memberId: l.memberId || null, borrowerName: l.borrowerName, expected: l.expected });

  const rows = [];
  let ended = false;
  sheet.rows.slice(sheet.header + 1).forEach((r, i) => {
    if (ended) return; // signatures and notes below the totals row
    const rowNo = sheet.header + i + 2;
    const cell = (idx) => (idx === undefined ? "" : String(r[idx] ?? "").trim());
    const loanNo = cell(ids.loanNo);
    const memberNo = cell(ids.memberNo);
    const employeeNo = cell(ids.employeeNo);
    const name = cell(ids.name) || [cell(ids.lastName), cell(ids.firstName)].filter(Boolean).join(", ");
    if (!loanNo && !memberNo && !employeeNo && !name) return; // blank row
    if (r.some((c) => /^(grand\s+)?total\b/i.test(String(c ?? "").trim()))) {
      ended = true; // the totals row ends the list
      return;
    }
    const rawAmount = cell(amountCol.index);
    const amount = rawAmount === "" ? 0 : parseAmount(rawAmount);
    const label = name || memberNo || employeeNo || loanNo;

    let candidates = [];
    let by = null;
    if (loanNo && byLoanNo.has(key(loanNo))) [candidates, by] = [[byLoanNo.get(key(loanNo))], "loan_no"];
    if (!by && memberNo && byMember.has(key(memberNo))) [candidates, by] = [byMember.get(key(memberNo)), "member_no"];
    if (!by && employeeNo && employeeOf.has(key(employeeNo)) && byMember.has(employeeOf.get(key(employeeNo)))) {
      [candidates, by] = [byMember.get(employeeOf.get(key(employeeNo))), "employee_no"];
    }
    if (!by && name) {
      const words = nameWords(name);
      const scored = live.map((l) => ({ l, score: nameScore(words, nameWords(l.borrowerName)) })).filter((x) => x.score > 0);
      const best = Math.max(0, ...scored.map((x) => x.score));
      candidates = scored.filter((x) => x.score === best).map((x) => x.l);
      if (candidates.length) by = "name";
    }
    const status = Number.isNaN(amount) ? "bad_amount" : candidates.length === 1 ? "matched" : candidates.length > 1 ? "ambiguous" : "not_found";
    rows.push({
      row: rowNo,
      label,
      loanNo: loanNo || null,
      memberNo: memberNo || null,
      employeeNo: employeeNo || null,
      name: name || null,
      amountText: rawAmount,
      amount: Number.isNaN(amount) ? null : amount,
      status,
      by,
      lineId: candidates.length === 1 ? String(candidates[0]._id) : null,
      candidates: candidates.map(lineView),
    });
  });

  // The same line matched by two rows: both need a look.
  const taken = groupBy(rows.filter((r) => r.lineId), (r) => r.lineId);
  for (const [, dup] of taken) {
    if (dup.length > 1) for (const r of dup) Object.assign(r, { status: "ambiguous", note: "Another row matched the same mutual assistance." });
  }
  const matched = new Set(rows.filter((r) => r.status === "matched").map((r) => r.lineId));
  const candidateIds = new Set(rows.flatMap((r) => (r.status === "ambiguous" ? r.candidates.map((c) => c.lineId) : [])));

  return {
    sheets: withHeader.map((s) => ({ name: s.name, usable: s.header >= 0 })),
    sheet: sheet.name,
    headerRow: sheet.header + 1,
    columns: columns.map(({ index, header, kind }) => ({ index, header, kind })),
    amountColumns: amountColumns.map((c) => c.header),
    amountColumn: amountCol.header,
    // Several amount columns and nothing remembered: the Bookkeeper should pick.
    pickAmountColumn: amountColumns.length > 1 && !wanted,
    mapping: {
      amount: amountCol.header,
      ...Object.fromEntries(ID_KEYS.filter((k) => ids[k] !== undefined).map((k) => [k, columns[ids[k]].header])),
    },
    rows,
    // Run lines with no row in the file: not remitted (unless a still-ambiguous row turns out to be theirs).
    missing: live.filter((l) => !matched.has(String(l._id))).map((l) => ({ ...lineView(l), maybe: candidateIds.has(String(l._id)) })),
    counts: {
      matched: rows.filter((r) => r.status === "matched").length,
      ambiguous: rows.filter((r) => r.status === "ambiguous").length,
      notFound: rows.filter((r) => r.status === "not_found").length,
      badAmount: rows.filter((r) => r.status === "bad_amount").length,
    },
  };
}

function rank(header) {
  const h = normHeader(header);
  const i = HEADER_WORDS.amount.findIndex((w) => h === w || new RegExp(`(^| )${w}( |$)`).test(h));
  return i < 0 ? 99 : i;
}

function groupBy(list, f) {
  const m = new Map();
  for (const x of list) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

module.exports = { HEADER_WORDS, ImportError, normHeader, classify, findHeader, readWorkbook, nameWords, nameScore, preview };
