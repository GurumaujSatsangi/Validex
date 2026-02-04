/**
 * Directory Management Agent
 * Executes system actions based strictly on QA decision
 * Publishes, queues for review, generates reports, and manages notifications
 */

/**
 * Generate web directory entry for publishing
 */
function generateWebDirectoryEntry(state) {
  const entry = {
    providerId: state.providerId,
    name: state.inputData.name,
    npi: state.inputData.npi,
    address: state.poiMetadata?.formattedAddress || state.inputData.address,
    phone: state.poiMetadata?.phone || state.inputData.phone,
    website: state.poiMetadata?.website || state.inputData.website,
    specialties: [
      state.inputData.specialty,
      ...state.enrichedProviderProfile.additionalSpecialties,
    ],
    services: state.enrichedProviderProfile.services,
    telemedicine: state.enrichedProviderProfile.telemedicineAvailable,
    languages: state.enrichedProviderProfile.languagesSpoken,
    geoCoordinates: state.geoCoordinates,
    rating: state.poiMetadata?.ratingScore || null,
    reviewCount: state.poiMetadata?.reviewCount || 0,
    education: {
      medicalSchool: state.educationDetails?.medicalSchool,
      residency: state.educationDetails?.residency,
      boardCertifications: state.educationDetails?.boardCertifications || [],
    },
    acceptedInsurance:
      state.enrichedProviderProfile.acceptedInsurance || [],
    verificationLevel: calculateVerificationLevel(state),
    publishedAt: new Date().toISOString(),
    confidence: state.overallConfidenceScore,
  };

  return entry;
}

/**
 * Calculate verification level based on confidence and sources
 */
function calculateVerificationLevel(state) {
  if (state.overallConfidenceScore >= 90) {
    return "FULLY_VERIFIED";
  } else if (state.overallConfidenceScore >= 75) {
    return "VERIFIED";
  } else if (state.overallConfidenceScore >= 60) {
    return "PARTIALLY_VERIFIED";
  } else {
    return "REQUIRES_VERIFICATION";
  }
}

/**
 * Generate mobile app feed entry
 */
function generateMobileAppFeed(state, webEntry) {
  return {
    providerId: state.providerId,
    name: state.inputData.name,
    specialty: state.inputData.specialty,
    location: {
      address: state.poiMetadata?.formattedAddress || state.inputData.address,
      coordinates: state.geoCoordinates,
    },
    phone: state.poiMetadata?.phone || state.inputData.phone,
    telemedicine: state.enrichedProviderProfile.telemedicineAvailable,
    services: state.enrichedProviderProfile.services.slice(0, 5), // Top 5 services
    rating: state.poiMetadata?.ratingScore,
    reviewCount: state.poiMetadata?.reviewCount,
    distanceFromUser: null, // Calculated at runtime based on user location
    acceptedInsurance: (
      state.enrichedProviderProfile.acceptedInsurance || []
    ).slice(0, 3), // Top 3 insurances
    bookingUrl: state.enrichedProviderProfile.appointmentBookingUrl || null,
    verificationLevel: calculateVerificationLevel(state),
    confidence: state.overallConfidenceScore,
  };
}

/**
 * Generate PDF export for compliance and archival
 */
function generateValidationReport(state, webEntry) {
  const report = {
    reportId: `report_${state.providerId}_${Date.now()}`,
    providerId: state.providerId,
    generatedAt: new Date().toISOString(),
    summary: {
      providerName: state.inputData.name,
      npi: state.inputData.npi,
      overallConfidenceScore: state.overallConfidenceScore,
      verificationLevel: calculateVerificationLevel(state),
      needsHumanReview: state.needsHumanReview,
      reviewSeverity: state.reviewSeverity,
    },
    validationDetails: {
      validatedFields: state.validatedFields.map((f) => ({
        field: f.field,
        verified: f.verified,
        confidence: f.confidence,
        source: f.source,
      })),
      discrepancies: state.validationDiscrepancies,
      sources: state.validationSources,
    },
    enrichmentDetails: {
      locationVerified: !!state.geoCoordinates?.latitude,
      educationVerified:
        !!state.educationDetails?.boardCertifications &&
        state.educationDetails.boardCertifications.length > 0,
      servicesDocumented:
        state.enrichedProviderProfile.services.length > 0,
    },
    qualityAssurance: {
      fieldConfidenceScores: state.fieldConfidenceScores,
      crossSourceComparison: state.crossSourceComparison,
      anomalyDetection: state.anomalyDetection,
    },
    directoryEntry: webEntry,
    compliance: {
      generatedBy: "DirectoryManagementAgent",
      workflowId: state.workflowId,
      timestamp: new Date().toISOString(),
      dataRetentionDays: 365,
    },
  };

  return report;
}

/**
 * Create human review task
 */
function createHumanReviewTask(state) {
  return {
    taskId: `task_${state.providerId}_${Date.now()}`,
    providerId: state.providerId,
    providerName: state.inputData.name,
    assignedAt: new Date().toISOString(),
    dueDate: calculateDueDate(state.reviewSeverity),
    priority: state.reviewSeverity,
    priorityScore: state.priorityScore,
    reviewType: determineReviewType(state),
    reviewReasons: state.anomalyDetection.isDetected
      ? state.anomalyDetection.patterns.map((p) => p.type)
      : ["Low confidence score"],
    conflictingData: state.crossSourceComparison.inconsistencies,
    suggestedActions: generateSuggestedActions(state),
    status: "PENDING",
    reviewerId: null,
    notes: "",
  };
}

/**
 * Calculate due date based on severity
 */
function calculateDueDate(severity) {
  const now = new Date();
  let daysToAdd = 7; // Default

  if (severity === "HIGH") {
    daysToAdd = 1; // 24 hours for high severity
  } else if (severity === "MEDIUM") {
    daysToAdd = 3; // 3 days for medium
  }

  const dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return dueDate.toISOString();
}

/**
 * Determine the type of review needed
 */
function determineReviewType(state) {
  if (state.anomalyDetection.fraudRisk === "HIGH") {
    return "FRAUD_INVESTIGATION";
  } else if (state.anomalyDetection.isDetected) {
    return "DATA_VERIFICATION";
  } else if (state.reviewSeverity === "MEDIUM") {
    return "COMPLIANCE_CHECK";
  } else {
    return "STANDARD_REVIEW";
  }
}

/**
 * Generate suggested actions for reviewer
 */
function generateSuggestedActions(state) {
  const actions = [];

  if (state.npiLookupResult === null) {
    actions.push("Verify NPI with NPI Registry manually");
  }

  if (state.licensingBoardResult === null) {
    actions.push("Contact state licensing board to verify license");
  }

  if (state.crossSourceComparison.inconsistencies.length > 0) {
    actions.push(
      `Reconcile ${state.crossSourceComparison.inconsistencies.length} data inconsistencies`
    );
  }

  if (
    state.anomalyDetection.patterns.some(
      (p) => p.type === "EXPIRED_CERTIFICATION"
    )
  ) {
    actions.push("Contact provider regarding expired certifications");
  }

  if (
    state.anomalyDetection.patterns.some(
      (p) => p.type === "LOCATION_STATE_MISMATCH"
    )
  ) {
    actions.push("Verify practice location with provider");
  }

  return actions;
}

/**
 * Create alert for urgent issues
 */
function createAlert(state, issue) {
  return {
    alertId: `alert_${state.providerId}_${Date.now()}`,
    providerId: state.providerId,
    issueType: issue.type,
    severity: issue.severity,
    description: issue.description,
    createdAt: new Date().toISOString(),
    status: "ACTIVE",
    notificationChannels: ["email", "dashboard"],
    recipientGroups: ["compliance_team", "qa_team"],
  };
}

/**
 * Auto-publish provider to directory
 */
async function publishToDirectory(state) {
  try {
    console.log(
      `[DirectoryManagement] Publishing provider ${state.providerId} to directory`
    );

    const webEntry = generateWebDirectoryEntry(state);
    const mobileEntry = generateMobileAppFeed(state, webEntry);
    const report = generateValidationReport(state, webEntry);

    // In production, persist these to database
    // await database.directoryEntries.insert(webEntry);
    // await database.mobileFeeds.insert(mobileEntry);
    // await database.validationReports.insert(report);

    return {
      success: true,
      webEntry,
      mobileEntry,
      report,
    };
  } catch (error) {
    console.error("[DirectoryManagement] Publishing error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Queue provider for human review
 */
async function queueForReview(state) {
  try {
    console.log(
      `[DirectoryManagement] Queueing provider ${state.providerId} for human review`
    );

    const reviewTask = createHumanReviewTask(state);
    const alerts = [];

    // Create alerts for critical issues
    if (state.reviewSeverity === "HIGH") {
      alerts.push(
        createAlert(state, {
          type: "URGENT_REVIEW_REQUIRED",
          severity: "HIGH",
          description: `Provider ${state.inputData.name} requires urgent human review`,
        })
      );
    }

    if (
      state.anomalyDetection.fraudRisk === "HIGH"
    ) {
      alerts.push(
        createAlert(state, {
          type: "FRAUD_SUSPECTED",
          severity: "HIGH",
          description: `Potential fraud detected for provider ${state.inputData.name}`,
        })
      );
    }

    // In production, persist these to database
    // await database.reviewTasks.insert(reviewTask);
    // await database.alerts.insertMany(alerts);
    // await notificationService.notify(reviewTask);

    return {
      success: true,
      reviewTask,
      alerts,
    };
  } catch (error) {
    console.error("[DirectoryManagement] Review queue error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main Directory Management Agent Node
 * Routes to publish or review based on QA decision
 */
export async function directoryManagementNode(state) {
  console.log(
    `[DirectoryManagementAgent] Processing provider: ${state.providerId}`
  );

  try {
    let directoryResult;
    let alerts = [];
    let reviewTasks = [];
    let validationReports = [];

    // Branch based on QA decision
    if (!state.needsHumanReview) {
      // Auto-publish path
      console.log(`[DirectoryManagement] Auto-publishing provider`);
      directoryResult = await publishToDirectory(state);

      if (directoryResult.success) {
        validationReports.push(directoryResult.report);
      }
    } else {
      // Human review path
      console.log(
        `[DirectoryManagement] Sending provider for human review (Severity: ${state.reviewSeverity})`
      );
      directoryResult = await queueForReview(state);

      if (directoryResult.success) {
        reviewTasks.push(directoryResult.reviewTask);
        alerts.push(...directoryResult.alerts);

        // Still generate validation report for archival
        const webEntry = generateWebDirectoryEntry(state);
        const report = generateValidationReport(state, webEntry);
        validationReports.push(report);
      }
    }

    // Update state with management results
    const updatedState = {
      ...state,
      directoryStatus: !state.needsHumanReview ? "PUBLISHED" : "NEEDS_REVIEW",
      alerts,
      reviewerTasks: reviewTasks,
      validationReports,
      webDirectoryEntry: directoryResult.success
        ? directoryResult.webEntry || null
        : null,
      mobileAppFeed: directoryResult.success
        ? directoryResult.mobileEntry || null
        : null,
      complianceReportUri:
        validationReports.length > 0
          ? `file://reports/${validationReports[0].reportId}.json`
          : null,
      workflowStatus: "COMPLETED",
      endTime: new Date(),
    };

    console.log(
      `[DirectoryManagementAgent] Workflow completed. Status: ${updatedState.directoryStatus}`
    );

    return updatedState;
  } catch (error) {
    console.error("[DirectoryManagementAgent] Error:", error.message);

    return {
      ...state,
      directoryStatus: "FAILED",
      workflowStatus: "FAILED",
      endTime: new Date(),
      errorLog: [
        ...state.errorLog,
        {
          stage: "DirectoryManagement",
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
