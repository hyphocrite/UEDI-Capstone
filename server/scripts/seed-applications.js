// Adds sample pending loan applications and scores them with the ML service.
//   npm run seed
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const Application = require("../src/models/Application");
const ml = require("../src/services/mlClient");

const DNSC = "Davao del Norte State College";
const signed = (date) => ({ payrollDeduction: true, autoRestructure: true, applicationDate: date });

// Sample Mutual Assistance applications, one per kind of case a loan officer sees.
const samples = [
  {
    applicant: { lastName: "Santos", firstName: "Maria", middleInitial: "C", memberId: "M-0001", residenceAddress: "Purok 5, New Visayas, Panabo City", employer: DNSC, employmentStatus: "permanent", monthlySalary: 46000, netTakeHomePay: 33000, dateOfBirth: "1984-03-12", yearsAsMember: 12, priorLoans: 6, priorLatePayments: 0 },
    loan: { loanType: "long_term", amount: 60000, termMonths: 24, monthlyRate: 1, paymentFrequency: "quincenal", purpose: "House repair" },
    bookkeeper: { longTermBalance: 0, shortTermBalance: 0 },
    documents: [{ fileName: "dnsc-id.jpg", type: "valid_id", verdict: "verified" }, { fileName: "payslip-sep.jpg", type: "payslip", verdict: "verified" }],
  },
  {
    applicant: { lastName: "Bautista", firstName: "Ramon", middleInitial: "D", memberId: "M-0004", residenceAddress: "Brgy. Gredu, Panabo City", employer: DNSC, employmentStatus: "job_order", monthlySalary: 15000, netTakeHomePay: 6500, dateOfBirth: "1991-07-02", yearsAsMember: 1, priorLoans: 3, priorLatePayments: 2 },
    loan: { loanType: "long_term", amount: 90000, termMonths: 36, monthlyRate: 1, paymentFrequency: "quincenal", purpose: "Motorcycle" },
    bookkeeper: { longTermBalance: 20000, shortTermBalance: 5000 },
    documents: [{ fileName: "id.jpg", type: "valid_id", verdict: "verified" }, { fileName: "payslip.jpg", type: "payslip", verdict: "mismatch", notes: ["Net pay on payslip is ₱5,100, application says ₱6,500."] }],
  },
  {
    applicant: { lastName: "Mendoza", firstName: "Liza", middleInitial: "R", memberId: "M-0005", residenceAddress: "Purok 2, Brgy. San Francisco, Panabo City", employer: DNSC, employmentStatus: "permanent", monthlySalary: 38000, netTakeHomePay: 19000, dateOfBirth: "1979-11-20", yearsAsMember: 9, priorLoans: 6, priorLatePayments: 1 },
    loan: { loanType: "long_term", amount: 120000, termMonths: 36, monthlyRate: 1, paymentFrequency: "monthly", purpose: "Tuition" },
    bookkeeper: { longTermBalance: 45000, shortTermBalance: 0 },
    documents: [{ fileName: "umid.png", type: "valid_id", verdict: "verified" }, { fileName: "payslip.pdf", type: "payslip", verdict: "verified" }, { fileName: "brgy-cert.jpg", type: "proof_of_address", verdict: "review" }],
  },
  {
    applicant: { lastName: "Torres", firstName: "Miguel", middleInitial: "A", memberId: "M-0010", residenceAddress: "Brgy. Cagangohan, Panabo City", employer: DNSC, employmentStatus: "contractual", monthlySalary: 21000, netTakeHomePay: 12500, dateOfBirth: "1999-01-15", yearsAsMember: 1, priorLoans: 1, priorLatePayments: 0 },
    loan: { loanType: "long_term", amount: 80000, termMonths: 24, monthlyRate: 1, paymentFrequency: "quincenal", purpose: "Laptop and appliances" },
    bookkeeper: { longTermBalance: 0, shortTermBalance: 4000 },
    documents: [{ fileName: "id.jpg", type: "valid_id", verdict: "review" }, { fileName: "payslip.jpg", type: "payslip", verdict: "verified" }],
  },
  {
    applicant: { lastName: "Aquino", firstName: "Grace", middleInitial: "L", memberId: "M-0007", residenceAddress: "Purok 1, New Visayas, Panabo City", employer: DNSC, employmentStatus: "permanent", monthlySalary: 52000, netTakeHomePay: 36000, dateOfBirth: "1970-06-08", yearsAsMember: 18, priorLoans: 9, priorLatePayments: 0 },
    loan: { loanType: "emergency", amount: 15000, termMonths: 6, monthlyRate: 1.5, paymentFrequency: "quincenal", purpose: "Hospital bills" },
    bookkeeper: { longTermBalance: 30000, shortTermBalance: 0 },
    documents: [{ fileName: "id.jpg", type: "valid_id", verdict: "verified" }, { fileName: "payslip.jpg", type: "payslip", verdict: "verified" }],
  },
].map((s) => {
  const a = s.applicant;
  return { ...s, applicant: { ...a, fullName: `${a.firstName} ${a.middleInitial}. ${a.lastName}` }, agreement: signed(new Date()) };
});

async function main() {
  await connectDb();
  const year = new Date().getFullYear();
  let n = await Application.countDocuments({ applicationNo: new RegExp(`^APP-${year}-`) });
  for (const s of samples) {
    const app = new Application({ ...s, applicationNo: `APP-${year}-${String(++n).padStart(4, "0")}`, submittedByName: "Sample data" });
    try {
      app.assessment = { ...(await ml.assess(app)), assessedAt: new Date() };
    } catch (err) {
      app.assessmentError = err.message;
    }
    await app.save();
    const e = app.assessment?.ensemble;
    console.log(`${app.applicationNo} ${s.applicant.fullName}: ${e ? `${e.suggestion} (${Math.round(e.defaultProbability * 100)}% risk)` : app.assessmentError}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
