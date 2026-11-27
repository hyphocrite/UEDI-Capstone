// UDEI's approval chain. Each step is signed by a user whose role has the same name as the step.
// The Treasurer signs last: their signature is the final approval, and they then release the money.
const STEPS = ["bookkeeper", "crecom_chair", "president", "treasurer"];

const STEP_LABELS = {
  bookkeeper: "Bookkeeper",
  crecom_chair: "Credit Committee Chairman",
  president: "President",
  treasurer: "Treasurer",
};

/**
 * The first step in the chain that these signatures don't cover yet, or null when every step is signed.
 * Worked out from the signatures rather than a stored step, so applications signed partly under an
 * earlier order (Bookkeeper, Treasurer, CreCom Chairman, President) carry on with whoever is left.
 */
function firstUnsigned(approvals = []) {
  const signed = new Set(approvals.filter((a) => a.decision === "approved").map((a) => a.step));
  return STEPS.find((s) => !signed.has(s)) ?? null;
}

/**
 * The step waiting for a signature, or "none" once the application is decided.
 * Applications saved before the chain existed have no signatures and start at the Bookkeeper.
 */
function currentStepOf(app) {
  if (app.status !== "pending") return "none";
  return firstUnsigned(app.approvals) ?? STEPS[STEPS.length - 1];
}

/** The step after `step` is signed on this application, or null when that completes the chain. */
const nextStep = (app, step) => firstUnsigned([...(app.approvals || []), { step, decision: "approved" }]);

/**
 * Mongo filter for pending applications waiting for `step`: every earlier step signed, this one not.
 * Uses the signatures, like currentStepOf, so it also finds applications from the earlier order.
 */
function awaitingStepFilter(step) {
  const before = STEPS.slice(0, STEPS.indexOf(step));
  return {
    status: "pending",
    $and: [{ "approvals.step": { $ne: step } }, ...(before.length ? [{ "approvals.step": { $all: before } }] : [])],
  };
}

/** true or false when the decision follows or goes against the ML suggestion; null when there is nothing to follow. */
function followsSuggestion(suggestion, decision) {
  if (!suggestion || suggestion === "review") return null;
  return (suggestion === "approve") === (decision === "approved");
}

module.exports = { STEPS, STEP_LABELS, currentStepOf, nextStep, awaitingStepFilter, followsSuggestion };
