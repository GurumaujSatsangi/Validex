/**
 * Directory Management Node
 * LangGraph node that executes directory publishing decisions
 * - Reads QA decision from state
 * - Publishes if confidence is high
 * - Flags for review if confidence is low
 * - Updates provider status in database
 */

import { supabase } from "../../supabaseClient.js";

/**
 * Directory Management Node - Entry point for LangGraph
 * Reads QA results from state and executes publishing logic
 */
export async function directoryManagementNode(state) {
  console.log("[DirectoryManagement] Processing provider:", state.providerId);
  console.log("[DirectoryManagement] Needs Review:", state.needsHumanReview);
  console.log("[DirectoryManagement] Confidence:", state.confidence?.finalScore);

  // CRITICAL: Check if user has manually accepted any issues
  const { data: acceptedIssues, error: issuesErr } = await supabase
    .from("validation_issues")
    .select("id, field_name, status")
    .eq("provider_id", state.providerId)
    .eq("status", "ACCEPTED");

  if (issuesErr) {
    console.error("[DirectoryManagement] Error checking accepted issues:", issuesErr);
  }

  const hasManuallyAcceptedIssues = acceptedIssues && acceptedIssues.length > 0;

  if (hasManuallyAcceptedIssues) {
    console.log(`[DirectoryManagement] Provider ${state.providerId} has ${acceptedIssues.length} manually accepted issue(s) - preserving ACTIVE status`);
    
    // User has manually reviewed and accepted changes - set to ACTIVE
    await supabase
      .from("providers")
      .update({ 
        status: "ACTIVE",
        updated_at: new Date().toISOString()
      })
      .eq("id", state.providerId);

    return {
      ...state,
      directoryStatus: "ACTIVE",
      alerts: [{
        type: "MANUAL_REVIEW_COMPLETED",
        severity: "LOW",
        message: `Provider has ${acceptedIssues.length} manually accepted issue(s) - status set to ACTIVE`,
        timestamp: new Date().toISOString(),
      }],
      decision: {
        ...(state.decision || {}),
        finalDecision: "MANUAL_ACCEPT",
      },
    };
  }

  let directoryStatus = "PUBLISHED";
  const alerts = [];

  const finalDecision = state.validationResults?.hardReject
    ? "REJECT"
    : state.needsHumanReview
      ? "NEEDS_REVIEW"
      : "APPROVE";

  if (finalDecision === "REJECT") {
    directoryStatus = "REJECTED";
    alerts.push({
      type: "REJECTED",
      severity: "HIGH",
      message: "Provider rejected due to missing or invalid required fields",
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from("providers")
      .update({ status: "REJECTED" })
      .eq("id", state.providerId);
  } else if (finalDecision === "NEEDS_REVIEW") {
    directoryStatus = "NEEDS_REVIEW";
    alerts.push({
      type: "REVIEW_REQUIRED",
      severity: state.reviewSeverity || "MEDIUM",
      message: `Provider requires human review (confidence: ${((state.confidence?.finalScore || 0) * 100).toFixed(1)}%)`,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from("providers")
      .update({ status: "NEEDS_REVIEW" })
      .eq("id", state.providerId);
  } else {
    directoryStatus = "PUBLISHED";
    alerts.push({
      type: "AUTO_PUBLISHED",
      severity: "LOW",
      message: `Provider auto-published (confidence: ${((state.confidence?.finalScore || 0) * 100).toFixed(1)}%)`,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from("providers")
      .update({
        status: "ACTIVE",
        last_validated_at: new Date().toISOString(),
      })
      .eq("id", state.providerId);
  }

  const validationReport = {
    providerId: state.providerId,
    confidence: state.confidence,
    directoryStatus,
    needsReview: state.needsHumanReview,
    reviewSeverity: state.reviewSeverity,
    sourcesUsed: (state.validationSources || []).filter(s => s.success).map(s => s.source),
    failedSources: (state.validationSources || []).filter(s => !s.success).map(s => s.source),
    discrepancies: state.validationDiscrepancies || [],
    timestamp: new Date().toISOString(),
  };

  return {
    ...state,
    directoryStatus,
    alerts,
    decision: {
      ...(state.decision || {}),
      finalDecision,
    },
    validationReports: [validationReport],
  };
}
