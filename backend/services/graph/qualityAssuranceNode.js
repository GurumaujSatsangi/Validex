/**
 * Quality Assurance Agent
 * Evaluates trustworthiness through confidence scoring, cross-source comparison,
 * and anomaly detection. Decides if human review is needed.
 * DOES NOT fetch new data or scrape - works only with aggregated state.
 */

/**
 * Compute field-level confidence scores based on source agreement and quality
 */
function computeFieldConfidenceScores(state) {
  const scores = {};

  // NPI field confidence
  if (state.validatedFields.some((f) => f.field === "npi" && f.verified)) {
    scores.npi = 0.95;
  } else {
    scores.npi = 0.0;
  }

  // License field confidence
  if (state.validatedFields.some((f) => f.field === "license" && f.verified)) {
    scores.license = 0.9;
  } else {
    scores.license = 0.0;
  }

  // Phone field confidence (cross-reference multiple sources)
  const phoneValidations = state.validatedFields.filter(
    (f) => f.field === "phone"
  );
  if (phoneValidations.length > 0) {
    // Higher confidence if verified from multiple sources
    scores.phone =
      0.8 + phoneValidations.length * 0.05;
  } else {
    scores.phone = 0.0;
  }

  // Address field confidence
  const addressValidations = state.validatedFields.filter(
    (f) => f.field === "address"
  );
  if (addressValidations.length > 0) {
    scores.address = 0.8 + Math.min(addressValidations.length * 0.05, 0.15);
  } else {
    scores.address = 0.0;
  }

  // Contact details confidence
  if (state.poiMetadata?.formattedAddress && state.poiMetadata?.phone) {
    scores.contactDetails = 0.85;
  } else {
    scores.contactDetails = 0.6;
  }

  // Education confidence
  if (
    state.educationDetails?.boardCertifications &&
    state.educationDetails.boardCertifications.length > 0
  ) {
    scores.education = 0.9;
  } else {
    scores.education = 0.5;
  }

  // Services and specialties confidence
  if (
    state.enrichedProviderProfile?.services &&
    state.enrichedProviderProfile.services.length > 0
  ) {
    scores.services = 0.8;
  } else {
    scores.services = 0.4;
  }

  return scores;
}

/**
 * Perform cross-source data comparison to detect inconsistencies
 */
function performCrossSourceComparison(state) {
  const comparison = {
    sources: {},
    inconsistencies: [],
    consistencyScore: 1.0,
  };

  // Compare NPI data with other sources
  if (state.npiLookupResult && state.poiMetadata) {
    const npiName = state.npiLookupResult.first_name || "";
    const poiName = state.poiMetadata.businessName || "";

    if (npiName.toLowerCase() !== poiName.toLowerCase()) {
      comparison.inconsistencies.push({
        field: "name",
        source1: "NPI",
        source2: "POI",
        value1: npiName,
        value2: poiName,
        severity: "MEDIUM",
      });
      comparison.consistencyScore -= 0.1;
    }
  }

  // Compare website data with POI data
  if (state.websiteScrapingResult && state.poiMetadata) {
    const websitePhone = state.websiteScrapingResult.phone || "";
    const poiPhone = state.poiMetadata.phone || "";

    if (
      websitePhone.replace(/\D/g, "") !== poiPhone.replace(/\D/g, "")
    ) {
      comparison.inconsistencies.push({
        field: "phone",
        source1: "WEBSITE",
        source2: "POI",
        value1: websitePhone,
        value2: poiPhone,
        severity: "LOW",
      });
      comparison.consistencyScore -= 0.05;
    }
  }

  // Record sources used
  state.validationSources.forEach((source) => {
    comparison.sources[source.source] = {
      fieldsValidated: source.fieldsValidated,
      timestamp: source.timestamp,
    };
  });

  return comparison;
}

/**
 * Detect anomalies and fraud patterns
 */
function detectAnomalies(state) {
  const anomalies = {
    isDetected: false,
    patterns: [],
    fraudRisk: "LOW",
  };

  // Check for license expiration
  if (state.educationDetails?.boardCertifications) {
    const expiredCerts = state.educationDetails.boardCertifications.filter(
      (cert) => {
        const expDate = new Date(cert.expirationDate);
        return expDate < new Date() && !cert.isActive;
      }
    );

    if (expiredCerts.length > 0) {
      anomalies.patterns.push({
        type: "EXPIRED_CERTIFICATION",
        count: expiredCerts.length,
        severity: "HIGH",
      });
      anomalies.isDetected = true;
      anomalies.fraudRisk = "MEDIUM";
    }
  }

  // Check for suspicious address patterns
  if (state.validationDiscrepancies.length > 3) {
    anomalies.patterns.push({
      type: "MULTIPLE_ADDRESS_DISCREPANCIES",
      count: state.validationDiscrepancies.length,
      severity: "MEDIUM",
    });
    anomalies.isDetected = true;
  }

  // Check for missing critical information
  const criticalFields = ["npi", "license", "phone", "address"];
  const missingFields = [];

  for (const field of criticalFields) {
    if (!state.validatedFields.some((f) => f.field === field && f.verified)) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 2) {
    anomalies.patterns.push({
      type: "MISSING_CRITICAL_FIELDS",
      fields: missingFields,
      severity: "HIGH",
    });
    anomalies.isDetected = true;
    anomalies.fraudRisk = "HIGH";
  }

  // Check for location inconsistencies
  if (
    state.geoCoordinates?.latitude &&
    state.inputData.state &&
    !isCoordinateInState(
      state.geoCoordinates.latitude,
      state.geoCoordinates.longitude,
      state.inputData.state
    )
  ) {
    anomalies.patterns.push({
      type: "LOCATION_STATE_MISMATCH",
      severity: "HIGH",
    });
    anomalies.isDetected = true;
    anomalies.fraudRisk = "MEDIUM";
  }

  return anomalies;
}

/**
 * Helper to check if coordinates are within a state (simplified)
 */
function isCoordinateInState(lat, lon, state) {
  // In production, use proper geofencing with state boundaries
  // This is a placeholder
  return true;
}

/**
 * Calculate overall confidence score using weighted average
 */
function calculateOverallConfidenceScore(fieldConfidenceScores) {
  const weights = {
    npi: 0.25,
    license: 0.2,
    phone: 0.15,
    address: 0.15,
    contactDetails: 0.1,
    education: 0.08,
    services: 0.07,
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(weights)) {
    const score = fieldConfidenceScores[field] || 0;
    totalScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Determine if provider needs human review based on confidence and anomalies
 */
function determineReviewNeed(state, overallScore, anomalies, comparison) {
  const needsReview = {
    decision: false,
    reasons: [],
    severity: "LOW",
    priorityScore: 0,
  };

  // Rule 1: Low confidence score
  if (overallScore < 0.7) {
    needsReview.decision = true;
    needsReview.reasons.push(
      `Low overall confidence score: ${(overallScore * 100).toFixed(2)}%`
    );
    needsReview.priorityScore += 50;
  }

  // Rule 2: Anomalies detected
  if (anomalies.isDetected) {
    needsReview.decision = true;
    needsReview.reasons.push("Anomalies detected in provider data");
    needsReview.priorityScore += 40;

    if (anomalies.fraudRisk === "HIGH") {
      needsReview.severity = "HIGH";
      needsReview.priorityScore += 50;
    } else if (anomalies.fraudRisk === "MEDIUM") {
      needsReview.severity = "MEDIUM";
      needsReview.priorityScore += 25;
    }
  }

  // Rule 3: Multiple source inconsistencies
  if (comparison.inconsistencies.length > 2) {
    needsReview.decision = true;
    needsReview.reasons.push(
      `Multiple source inconsistencies: ${comparison.inconsistencies.length}`
    );
    needsReview.priorityScore += 30;
    needsReview.severity =
      needsReview.severity === "HIGH" ? "HIGH" : "MEDIUM";
  }

  // Rule 4: Missing critical validation
  if (overallScore >= 0.7 && overallScore < 0.85) {
    needsReview.decision = true;
    needsReview.reasons.push("Data requires validation refinement");
    needsReview.priorityScore += 20;
    if (needsReview.severity === "LOW") {
      needsReview.severity = "LOW";
    }
  }

  // High confidence = auto-approve
  if (overallScore >= 0.85 && !anomalies.isDetected) {
    needsReview.decision = false;
    needsReview.reasons.push("High confidence in provider data");
    needsReview.priorityScore = 0;
    needsReview.severity = "LOW";
  }

  return needsReview;
}

/**
 * Main Quality Assurance Agent Node
 * Orchestrates confidence scoring and review decision
 */
export async function qualityAssuranceNode(state) {
  console.log(
    `[QualityAssuranceAgent] Evaluating provider: ${state.providerId}`
  );

  try {
    // Step 1: Compute field-level confidence scores
    const fieldConfidenceScores = computeFieldConfidenceScores(state);

    // Step 2: Perform cross-source comparison
    const crossSourceComparison = performCrossSourceComparison(state);

    // Step 3: Detect anomalies
    const anomalyDetection = detectAnomalies(state);

    // Step 4: Calculate overall confidence score
    const overallConfidenceScore =
      calculateOverallConfidenceScore(fieldConfidenceScores);

    // Step 5: Determine if human review is needed
    const reviewDecision = determineReviewNeed(
      state,
      overallConfidenceScore,
      anomalyDetection,
      crossSourceComparison
    );

    // Update state with QA results
    const updatedState = {
      ...state,
      fieldConfidenceScores,
      overallConfidenceScore: parseFloat(
        (overallConfidenceScore * 100).toFixed(2)
      ),
      needsHumanReview: reviewDecision.decision,
      reviewSeverity: reviewDecision.severity,
      priorityScore: reviewDecision.priorityScore,
      anomalyDetection,
      crossSourceComparison,
    };

    console.log(
      `[QualityAssuranceAgent] Review needed: ${reviewDecision.decision} (Score: ${(overallConfidenceScore * 100).toFixed(2)}%, Severity: ${reviewDecision.severity})`
    );

    return updatedState;
  } catch (error) {
    console.error("[QualityAssuranceAgent] Error:", error.message);

    return {
      ...state,
      needsHumanReview: true,
      reviewSeverity: "HIGH",
      errorLog: [
        ...state.errorLog,
        {
          stage: "QualityAssurance",
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
