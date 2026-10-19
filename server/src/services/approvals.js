// UEDI's approval chain, from the signature block of the Mutual Assistance form.
// Each step is signed by a user whose role has the same name as the step.
const STEPS = ["bookkeeper", "treasurer", "crecom_chair", "president"];

const STEP_LABELS = {
  bookkeeper: "Bookkeeper",
  treasurer: "Treasurer",
  crecom_chair: "Credit Committee Chairman",
  president: "President",
};

/**
 * The step waiting for a signature, or "none" once the application is decided.
 * Applications saved before the chain existed have no currentStep and start at the Bookkeeper.
 */
function currentStepOf(app) {
  if (app.status !== "pending") return "none";
  return STEPS.includes(app.currentStep) ? app.currentStep : "bookkeeper";
}

const nextStep = (step) => STEPS[STEPS.indexOf(step) + 1] ?? null;

/** true or false when the decision follows or goes against the ML suggestion; null when there is nothing to follow. */
function followsSuggestion(suggestion, decision) {
  if (!suggestion || suggestion === "review") return null;
  return (suggestion === "approve") === (decision === "approved");
}

module.exports = { STEPS, STEP_LABELS, currentStepOf, nextStep, followsSuggestion };
