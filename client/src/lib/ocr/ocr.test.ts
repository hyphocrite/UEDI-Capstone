// Unit tests for the document checks, on OCR text as Tesseract really returns it
// (misread letters, merged words, values on the next line). Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDocument } from './analyzeDocument'
import type { Applicant } from './analyzeDocument'
import { detectDocumentType } from './documentTypes'
import { amountsIn, extractPayslip, findDates } from './extractors'
import { matchAddress, matchEmployer, matchName, similarity } from './matching'

const ana: Applicant = {
  lastName: 'Dela Cruz',
  firstName: 'Ana Marie',
  middleInitial: 'S',
  residenceAddress: 'Purok 3, Brgy. New Visayas, Panabo City, Davao del Norte',
  employer: 'Davao del Norte State College',
  monthlySalary: 27000,
  netTakeHomePay: 18450,
}
const today = new Date('2026-10-19')

const PAYSLIP = `DAVAO DEL N0RTE STATE C0LLEGE
New Visayas, Panabo City
PAYSLIP
Pay Period: October 1-15, 2026
Employee Name: DELA CRUZ, ANA MARIE S.     Employee No. 2015-0042
Basic Salary        27,000.00
PERA                 2,000.00
Gross Pay           29,000.00
Deductions
GSIS Premium         2,430.00
PhilHealth             675.00
Pag-IBIG               200.00
Withholding Tax      1,250.00
UEDI Mutual Assistance 5,220.00
Total Deductions     9,775.00
NET PAY (1st Quincena)
9,225.00`

const NATIONAL_ID = `REPUBLIKA NG PILIPINAS
Republic of the Philippines
PAMBANSANG PAGKAKAKILANLAN
Philippine Identification Card
1234-5678-9012-3456
Apelyido/Last Name
DELACRUZ
Mga Pangalan/Given Names
ANA MARIE
Gitnang Apelyido/Middle Name
SANTOS
Petsa ng Kapanganakan/Date of Birth
MARCH 14, 1988`

const BARANGAY = `Republic of the Philippines
Province of Davao del Norte
City of Panabo
BARANGAY NEW VISAYAS
OFFICE OF THE PUNONG BARANGAY
BARANGAY CERTIFICATE OF RESIDENCY
TO WHOM IT MAY CONCERN:
This is to certify that ANA MARIE S. DELA CRUZ, of legal age, is a bona fide
resident of Prk. 3, Brgy. New Visayas, Panabo City.
Issued this 2nd day of October 2026, September 30, 2026 at Barangay New Visayas.`

test('similarity tolerates one OCR slip per word', () => {
  assert.ok(similarity('SANTOS', 'SANT0S') >= 0.8)
  assert.ok(similarity('SANTOS', 'SANCHEZ') < 0.8)
})

test('names match across layouts and OCR errors', () => {
  assert.equal(matchName('Employee Name: DELA CRUZ, ANA MARIE S.', ana).status, 'pass')
  assert.equal(matchName(NATIONAL_ID, ana).status, 'pass', 'DELACRUZ merged into one word')
  assert.equal(matchName('Name: DE1A CRUZ ANA MAR1E', ana).status, 'pass', 'digit for letter')
  assert.equal(matchName('Name: ANA MARIE REYES', ana).status, 'fail')
  assert.equal(matchName('Name: JOSE DELA CRUZ', ana).status, 'fail', 'same surname, different person')
})

test('addresses match on the distinctive parts', () => {
  assert.equal(matchAddress(BARANGAY, ana.residenceAddress).status, 'pass')
  assert.equal(matchAddress('resident of Purok 7, Brgy. Gredu, Panabo City', ana.residenceAddress).status, 'fail')
})

test('employer matches the long or short form', () => {
  assert.equal(matchEmployer(PAYSLIP, 'DNSC').status, 'pass')
  assert.equal(matchEmployer('DNSC Faculty ID', ana.employer).status, 'pass')
  assert.equal(matchEmployer('Panabo City Water District', ana.employer).status, 'fail')
})

test('amounts survive OCR letters and spacing', () => {
  assert.deepEqual(amountsIn('Basic Salary  2O,5OO.OO'), [20500])
  assert.deepEqual(amountsIn('Pay Period: October 1-15 2026'), [])
  assert.deepEqual(amountsIn('Net 12 345.50'), [12345.5])
})

test('payslip reader finds basic, gross and net, including values on the next line', () => {
  const p = extractPayslip(PAYSLIP)
  assert.deepEqual(p, { basic: 27000, gross: 29000, net: 9225, semiMonthly: true })
})

test('payslip table layout: labels on one row, values on the next', () => {
  const p = extractPayslip('Basic Salary   PERA   Gross Pay   Net Pay\n25,000.00  2,000.00  27,000.00  18,100.00')
  assert.equal(p.basic, 25000)
  assert.equal(p.net, 18100)
})

test('pay period end date counts as the payslip date', () => {
  assert.deepEqual(findDates('Pay Period: October 1-15, 2026'), ['2026-10-15'])
})

test('document types are detected', () => {
  assert.equal(detectDocumentType(PAYSLIP).id, 'payslip')
  assert.equal(detectDocumentType(NATIONAL_ID).id, 'valid_id')
  assert.equal(detectDocumentType(BARANGAY).id, 'proof_of_address')
})

test('genuine payslip is verified; semi-monthly net pay is doubled', () => {
  const r = analyzeDocument(PAYSLIP, ana, { today })
  assert.equal(r.typeId, 'payslip')
  assert.equal(r.verdict, 'verified', JSON.stringify(r.checks))
  assert.match(r.checks.find((c) => c.id === 'netPay')!.detail, /quincena/)
})

test('inflated salary or net pay is caught', () => {
  assert.equal(analyzeDocument(PAYSLIP, { ...ana, monthlySalary: 35000 }, { today }).verdict, 'mismatch')
  assert.equal(analyzeDocument(PAYSLIP, { ...ana, netTakeHomePay: 24000 }, { today }).verdict, 'mismatch')
})

test('old payslip fails the date check', () => {
  const r = analyzeDocument(PAYSLIP, ana, { today: new Date('2027-03-01') })
  assert.equal(r.checks.find((c) => c.id === 'recent')!.status, 'fail')
})

test('national ID with no expiry is verified; wrong person is a mismatch', () => {
  assert.equal(analyzeDocument(NATIONAL_ID, ana, { today }).verdict, 'verified')
  assert.equal(analyzeDocument(NATIONAL_ID, { ...ana, lastName: 'Reyes' }, { today }).verdict, 'mismatch')
})

test('barangay certificate proves the address', () => {
  assert.equal(analyzeDocument(BARANGAY, ana, { today }).verdict, 'verified')
  const moved = analyzeDocument(BARANGAY, { ...ana, residenceAddress: 'Purok 1, Brgy. Gredu, Panabo City' }, { today })
  assert.equal(moved.checks.find((c) => c.id === 'address')!.status, 'fail')
})

test('signed form always asks for an eye check of the signature', () => {
  const form = 'UNITED DNSC EMPLOYEES, INC.\nMUTUAL ASSISTANCE APPLICATION FORM\nName: Dela Cruz Ana Marie S\nSignature of the Applicant'
  const r = analyzeDocument(form, ana, { today })
  assert.equal(r.typeId, 'application_form')
  assert.equal(r.verdict, 'review')
})

test('blank photo is unreadable', () => {
  assert.equal(analyzeDocument('  \n ~ ', ana, { today }).verdict, 'unreadable')
})

test('certificate issue dates are read', () => {
  assert.deepEqual(findDates('Issued this 10th day of October, 2026 at Panabo City.'), ['2026-10-10'])
})

test('UEDI form mentioning salary and net pay is not mistaken for a payslip', () => {
  const form = 'UNITED DNSC EMPLOYEES, INC.\nMUTUAL ASSISTANCE APPLICATION FORM\nMonthly Salary: 27,000.00 Net take home pay: 18,450.00\nPayroll Officer'
  assert.equal(detectDocumentType(form).id, 'application_form')
})
