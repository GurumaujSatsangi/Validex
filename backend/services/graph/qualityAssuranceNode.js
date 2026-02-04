/**
 * Quality Assurance Node
 * LangGraph node that evaluates data quality and calculates confidence scores
 * - Compares all source data
 * - Detects conflicts and discrepancies
 * - Computes weighted confidence score
 * - Determines if human review is needed
 * All logic happens inside this node using state data only
 */

import { addressesMatch, normalizeText } from "../tools/addressUtils.js";
import { normalizePhone } from "../tools/phoneUtils.js";

/**
 * Quality Assurance Node - Entry point for LangGraph
 * Reads all validation + enrichment results from state
 * Computes confidence scores and determines review status
 * Writes decision to state
 */
export async function qualityAssuranceNode(state) {
  console.log("[QualityAssurance] Starting QA for provider:", state.providerId);

  const input = state.normalizedData || state.inputData || {};
  const externalResults = state.externalResults || {};
  const validationDiscrepancies = [...(state.validationDiscrepancies || [])];

  const contributions = {
    npi: 0,
    license: 0,
    website: 0,
    phone: 0,
  };

  const weights = {
    npi: 0.35,
    license: 0.25,
    website: 0.20,
    phone: 0.20,
  };

  // NPI verification
  if (externalResults.npi?.success && externalResults.npi?.data) {
    const npiName = normalizeText(externalResults.npi.data.name || "");
    const inputName = normalizeText(input.name || "");
    const nameMatch = npiName && inputName ? npiName.includes(inputName) || inputName.includes(npiName) : false;

    const npiAddress = externalResults.npi.data.address
      ? [
          externalResults.npi.data.address.address_1,
          externalResults.npi.data.address.address_2,
          externalResults.npi.data.address.city,
          externalResults.npi.data.address.state,
          externalResults.npi.data.address.postal_code,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    const addressMatch = npiAddress && input.address ? addressesMatch(input.address, npiAddress, 0.95) : false;
    const phoneMatch = externalResults.npi.data.phone && input.phone
      ? normalizePhone(externalResults.npi.data.phone) === normalizePhone(input.phone)
      : false;

    contributions.npi = nameMatch || addressMatch || phoneMatch ? 1 : 0.5;

    if (!nameMatch) {
      validationDiscrepancies.push({ field: "name", issue: "NPI_NAME_MISMATCH", severity: "MEDIUM" });
    }
    if (npiAddress && !addressMatch) {
      validationDiscrepancies.push({ field: "address", issue: "NPI_ADDRESS_MISMATCH", severity: "MEDIUM" });
    }
    if (externalResults.npi.data.phone && !phoneMatch) {
      validationDiscrepancies.push({ field: "phone", issue: "NPI_PHONE_MISMATCH", severity: "MEDIUM" });
    }
  }

  // License verification
  if (externalResults.license?.success && externalResults.license?.data) {
    const status = String(externalResults.license.data.licenseStatus || "").toUpperCase();
    contributions.license = status === "ACTIVE" ? 1 : 0;
    if (status && status !== "ACTIVE") {
      validationDiscrepancies.push({ field: "license_status", issue: "LICENSE_INACTIVE", severity: "HIGH" });
    }
  }

  // Website match
  if (externalResults.website?.success && externalResults.website?.data) {
    const webPhone = externalResults.website.data.phone || null;
    const webAddress = externalResults.website.data.address || null;
    const phoneMatch = webPhone && input.phone ? normalizePhone(webPhone) === normalizePhone(input.phone) : false;
    const addressMatch = webAddress && input.address ? addressesMatch(input.address, webAddress, 0.95) : false;
    contributions.website = phoneMatch || addressMatch ? 1 : 0.5;

    if (webPhone && !phoneMatch) {
      validationDiscrepancies.push({ field: "phone", issue: "WEBSITE_PHONE_MISMATCH", severity: "MEDIUM" });
    }
    if (webAddress && !addressMatch) {
      validationDiscrepancies.push({ field: "address", issue: "WEBSITE_ADDRESS_MISMATCH", severity: "MEDIUM" });
    }
  }

  // Phone verification
  if (externalResults.phone?.success) {
    contributions.phone = 1;
  }

  const baseScore =
    contributions.npi * weights.npi +
    contributions.license * weights.license +
    contributions.website * weights.website +
    contributions.phone * weights.phone;

  const apiFailures = (state.validationSources || []).filter(s => s.success === false);
  const conflictCount = validationDiscrepancies.filter(d => d.issue?.includes("MISMATCH") || d.issue?.includes("INACTIVE")).length;

  const penalties = {
    apiFailure: apiFailures.length * 0.05,
    conflicts: conflictCount * 0.10,
  };

  let finalScore = Math.max(0, baseScore - penalties.apiFailure - penalties.conflicts);

  if (state.validationResults?.hardReject) {
    finalScore = 0;
  }

  let confidenceLevel = "low";
  if (finalScore >= 0.75) confidenceLevel = "high";
  else if (finalScore >= 0.5) confidenceLevel = "medium";

  const needsHumanReview = finalScore < 0.65 || conflictCount > 0 || apiFailures.length > 0 || state.validationResults?.hardReject;

  const reviewSeverity = finalScore < 0.4 ? "HIGH" : finalScore < 0.65 ? "MEDIUM" : "LOW";

  const reviewReasons = [];
  if (apiFailures.length > 0) reviewReasons.push("EXTERNAL_SOURCE_FAILURE");
  if (conflictCount > 0) reviewReasons.push("DATA_CONFLICTS");
  if (state.validationResults?.hardReject) reviewReasons.push("MISSING_OR_INVALID_REQUIRED_FIELDS");

  return {
    ...state,
    validationDiscrepancies,
    confidence: {
      finalScore,
      contributions,
      penalties,
      level: confidenceLevel,
    },
    needsHumanReview,
    reviewSeverity,
    decision: {
      recommendedAction: state.validationResults?.hardReject ? "REJECT" : needsHumanReview ? "NEEDS_REVIEW" : "APPROVE",
      reasons: reviewReasons,
    },
  };
}
