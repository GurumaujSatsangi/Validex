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
import { addressSimilarity, sourceWeightedVote, finalScore } from "../utils/scoringUtils.js";

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
      const srcScore = sourceWeightedVote({ npi: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 0, hasAuthoritativeSource: true });
      validationDiscrepancies.push({ field: "name", issue: "NPI_NAME_MISMATCH", severity: "MEDIUM", sourceType: "NPI_API", suggestedValue: externalResults.npi.data.name || null, confidence });
    }
    if (npiAddress && !addressMatch) {
      const srcScore = sourceWeightedVote({ npi: true });
      const addrScore = addressSimilarity(input.address || "", npiAddress || "");
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0, hasAuthoritativeSource: true });
      validationDiscrepancies.push({ field: "address", issue: "NPI_ADDRESS_MISMATCH", severity: "MEDIUM", sourceType: "NPI_API", suggestedValue: npiAddress, confidence });
    }
    if (externalResults.npi.data.phone && !phoneMatch) {
      const srcScore = sourceWeightedVote({ npi: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 1, hasAuthoritativeSource: true });
      validationDiscrepancies.push({ field: "phone", issue: "NPI_PHONE_MISMATCH", severity: "MEDIUM", sourceType: "NPI_API", suggestedValue: externalResults.npi.data.phone, confidence });
    }
  }

  // License verification
  if (externalResults.license?.success && externalResults.license?.data) {
    const status = String(externalResults.license.data.licenseStatus || "").toUpperCase();
    contributions.license = status === "ACTIVE" ? 1 : 0;
    if (status && status !== "ACTIVE") {
      validationDiscrepancies.push({
        field: "license_status",
        issue: "LICENSE_INACTIVE",
        severity: "HIGH",
        sourceType: "LICENSE_REGISTRY",
        confidence: 0.8,
      });
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
      const srcScore = sourceWeightedVote({ scrape: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 0.6, hasMultipleSources: false });
      validationDiscrepancies.push({ field: "phone", issue: "WEBSITE_PHONE_MISMATCH", severity: "MEDIUM", sourceType: "WEBSITE", suggestedValue: webPhone, confidence });
    }
    if (webAddress && !addressMatch) {
      const srcScore = sourceWeightedVote({ scrape: true });
      const addrScore = addressSimilarity(input.address || "", webAddress || "");
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0, hasMultipleSources: false });
      validationDiscrepancies.push({ field: "address", issue: "WEBSITE_ADDRESS_MISMATCH", severity: "MEDIUM", sourceType: "WEBSITE", suggestedValue: webAddress, confidence });
    }
  }

  // Azure POI / Maps validation (additional authoritative-ish source)
  const azureAddr = externalResults.azure?.data?.address || externalResults.azureAddress?.data?.formattedAddress || null;
  const azurePhone = externalResults.azure?.data?.phone || null;
  if (azureAddr || azurePhone) {
    const phoneMatchA = azurePhone && input.phone ? normalizePhone(azurePhone) === normalizePhone(input.phone) : false;
    const addressMatchA = azureAddr && input.address ? addressesMatch(input.address, azureAddr, 0.95) : false;
    if (azurePhone && !phoneMatchA) {
      const srcScore = 0.85; // approximate Azure weight
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 0.6, hasMultipleSources: false });
      validationDiscrepancies.push({ field: "phone", issue: "AZURE_PHONE_MISMATCH", severity: "MEDIUM", sourceType: "AZURE_MAPS", suggestedValue: azurePhone, confidence });
    }
    if (azureAddr && !addressMatchA) {
      const srcScore = 0.85;
      const addrScore = addressSimilarity(input.address || "", azureAddr || "");
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0, hasMultipleSources: false });
      validationDiscrepancies.push({ field: "address", issue: "AZURE_ADDRESS_MISMATCH", severity: "MEDIUM", sourceType: "AZURE_MAPS", suggestedValue: azureAddr, confidence });
    }
  }

  // Certifications discrepancy (suggest primary certification when available)
  if (externalResults.certifications?.success && externalResults.certifications?.data) {
    const primary = externalResults.certifications.data.certifications?.find(c => c.isPrimary) || externalResults.certifications.data.certifications?.[0];
    if (primary && primary.name) {
      const srcScore = sourceWeightedVote({ npi: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 0, hasAuthoritativeSource: true, hasMultipleSources: !!primary.license });
      // Treat certification suggestion as medium severity, authoritative (NPI)
      validationDiscrepancies.push({ field: "certification", issue: "CERTIFICATION_SUGGESTED", severity: "MEDIUM", sourceType: "NPI_CERTIFICATIONS", suggestedValue: primary.name + (primary.license ? ` (License: ${primary.license})` : ""), confidence });
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

  let finalConfidence = Math.max(0, baseScore - penalties.apiFailure - penalties.conflicts);

  if (state.validationResults?.hardReject) {
    finalConfidence = 0;
  }

  let confidenceLevel = "low";
  if (finalConfidence >= 0.75) confidenceLevel = "high";
  else if (finalConfidence >= 0.5) confidenceLevel = "medium";

  const needsHumanReview = finalConfidence < 0.65 || conflictCount > 0 || apiFailures.length > 0 || state.validationResults?.hardReject;

  const reviewSeverity = finalConfidence < 0.4 ? "HIGH" : finalConfidence < 0.65 ? "MEDIUM" : "LOW";

  const reviewReasons = [];
  if (apiFailures.length > 0) reviewReasons.push("EXTERNAL_SOURCE_FAILURE");
  if (conflictCount > 0) reviewReasons.push("DATA_CONFLICTS");
  if (state.validationResults?.hardReject) reviewReasons.push("MISSING_OR_INVALID_REQUIRED_FIELDS");

  // Deduplicate discrepancies: keep only highest-confidence suggestion per field
  const fieldSuggestionMap = new Map();

  for (const disc of validationDiscrepancies) {
    const field = disc.field || "unknown";
    const confidence = disc.confidence || 0;
    
    if (fieldSuggestionMap.has(field)) {
      const existing = fieldSuggestionMap.get(field);
      // Only replace if this suggestion has higher confidence
      if (confidence > (existing.confidence || 0)) {
        fieldSuggestionMap.set(field, disc);
      }
      // Otherwise skip this duplicate
    } else {
      // Add as first suggestion for this field
      fieldSuggestionMap.set(field, disc);
    }
  }

  const deduplicatedDiscrepancies = Array.from(fieldSuggestionMap.values());

  return {
    ...state,
    validationDiscrepancies: deduplicatedDiscrepancies,
    confidence: {
      finalScore: finalConfidence,
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
