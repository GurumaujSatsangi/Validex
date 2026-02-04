/**
 * Needs Review Node
 * Separate path for low-confidence or conflicted validations.
 * Sets review flags and reasons in state.
 */

export async function needsReviewNode(state) {
  const reasons = [...(state.decision?.reasons || [])];

  if (reasons.length === 0) {
    reasons.push("LOW_CONFIDENCE");
  }

  return {
    ...state,
    needsHumanReview: true,
    decision: {
      ...(state.decision || {}),
      finalDecision: "NEEDS_REVIEW",
      reasons,
    },
  };
}
