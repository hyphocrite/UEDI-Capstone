const mongoose = require("mongoose");

// A payment made outside payroll (cash, e-money such as GCash or Maya, or a bank transfer) on its
// way to the ledger. Two steps, as UDEI does it on paper:
//   submitted: reported by the member (with a reference and proof) or entered at the office;
//   received:  the Treasurer has the money and issued the Official Receipt (OR);
//   posted:    the Bookkeeper confirmed it, which records the Payment and lowers the balance.
// Either signer can turn it down instead (rejected), with a reason. Amounts are integer centavos.
const SUBMISSION_METHODS = ["cash", "e_money", "bank_transfer"];
const SUBMISSION_STATUSES = ["submitted", "received", "posted", "rejected"];

const by = {
  by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  byName: String,
  at: Date,
};

const submissionSchema = new mongoose.Schema(
  {
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true, index: true },
    loanNo: { type: String, required: true },
    memberId: String,
    borrowerName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    method: { type: String, enum: SUBMISSION_METHODS, required: true },
    paidAt: { type: Date, required: true },
    // The e-money or bank reference number. Required for those two methods.
    reference: { type: String, trim: true, maxlength: 60 },
    // A photo or PDF of the receipt or transfer screen, in GridFS (services/documentFiles.js).
    proof: {
      fileId: mongoose.Schema.Types.ObjectId,
      fileName: String,
      contentType: String,
      size: Number,
      uploadedAt: Date,
    },
    note: { type: String, trim: true, maxlength: 300 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submittedByName: String,
    source: { type: String, enum: ["member", "office"], required: true },
    status: { type: String, enum: SUBMISSION_STATUSES, default: "submitted", index: true },
    received: {
      orNumber: { type: String, trim: true, maxlength: 30 },
      receivedAt: Date,
      ...by,
    },
    confirmed: { ...by },
    // The Payment the Bookkeeper's confirmation posted.
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    rejected: { reason: { type: String, trim: true, maxlength: 300 }, ...by },
    // Set when the posted Payment is voided later (routes/loans.js void route).
    voided: { reason: { type: String, trim: true, maxlength: 300 }, ...by },
    // Locks the submission while the Bookkeeper's confirmation records the payment.
    posting: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// An Official Receipt number is used once.
submissionSchema.index({ "received.orNumber": 1 }, { unique: true, partialFilterExpression: { "received.orNumber": { $type: "string" } } });
submissionSchema.index({ paidAt: -1 });

module.exports = mongoose.model("PaymentSubmission", submissionSchema);
module.exports.SUBMISSION_METHODS = SUBMISSION_METHODS;
module.exports.SUBMISSION_STATUSES = SUBMISSION_STATUSES;
