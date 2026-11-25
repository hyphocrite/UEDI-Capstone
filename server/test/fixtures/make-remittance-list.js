// Builds remittance-list.xlsx: a made-up list shaped like DNSC Accounting's remittance list for one
// cutoff (title rows, then Employee No., Name, Mutual Assistance, Ret. Plan, Total, and a totals row).
// Every name is invented. Run: node test/fixtures/make-remittance-list.js
// When UDEI's real sample arrives, compare its headers with HEADER_WORDS in services/remittanceImport.js.
const path = require("node:path");
const ExcelJS = require("exceljs");

const ROWS = [
  // Employee No., Name, Mutual Assistance, Ret. Plan
  ["E-1001", "SANTOS, MARIA C.", 1409.1, 500], // matched by employee no. (on the member record)
  ["E-1002", "RIZAL, JOSE R.", 1409.1, 500], // no employee no. on record: matched by name
  ["E-1003", "REYES, ANA", 704.55, 250], // two borrowers named Ana Reyes: ambiguous
  ["E-1004", "DE LOS SANTOS, PABLO", 1000, 0], // nobody of that name on the run: not found
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Remittance");
  ws.addRow(["DAVAO DEL NORTE STATE COLLEGE"]);
  ws.addRow(["Accounting Office"]);
  ws.addRow(["Remittance List: UDEI deductions, cutoff September 15, 2026"]);
  ws.addRow([]);
  ws.addRow(["Employee No.", "Name", "Mutual Assistance", "Ret. Plan", "Total"]);
  for (const [no, name, ma, rp] of ROWS) ws.addRow([no, name, ma, rp, Math.round((ma + rp) * 100) / 100]);
  const sum = (i) => Math.round(ROWS.reduce((s, r) => s + r[i] * 100, 0)) / 100;
  ws.addRow(["", "TOTAL", sum(2), sum(3), Math.round((sum(2) + sum(3)) * 100) / 100]);
  ws.addRow([]);
  ws.addRow(["Prepared by: (made-up) Accounting Clerk"]);
  ws.getColumn(3).numFmt = "#,##0.00";
  wb.addWorksheet("Notes").addRow(["Hard copy signed and kept at the Accounting Office."]);
  const out = path.join(__dirname, "remittance-list.xlsx");
  await wb.xlsx.writeFile(out);
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
