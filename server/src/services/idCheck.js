// The ID name check on a self-applied loan: the name on the valid government ID must match the
// applicant's. The applicant's browser compares them with OCR; the server trusts only a "verified"
// ID. Anything else (review, mismatch, unreadable, or no verdict, as on mobile uploads) is left for
// the Bookkeeper to compare by hand when they sign.

/** "passed" when a valid ID was verified by the OCR, otherwise "needs_check". */
function idCheckStatus(documents = []) {
  return documents.some((d) => d.type === "valid_id" && d.verdict === "verified") ? "passed" : "needs_check";
}

/**
 * Where the check stands, for the chip on Pending Loans: passed, needs_check, checked (the Bookkeeper
 * compared it and it matches) or mismatch (the Bookkeeper found it doesn't).
 */
function idCheckState(app) {
  if (idCheckStatus(app.documents) === "passed") return "passed";
  const manual = app.idCheck?.manual?.result;
  return manual === "matches" ? "checked" : manual === "mismatch" ? "mismatch" : "needs_check";
}

const ID_MISMATCH = "The ID name doesn't match the applicant. Ask for a correct ID or deny.";

module.exports = { idCheckStatus, idCheckState, ID_MISMATCH };
