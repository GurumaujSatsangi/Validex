/**
 * Example Invocation and Usage of the Validation Workflow
 * Demonstrates how to execute the LangGraph workflow with real provider data
 */

import {
  executeValidationWorkflow,
  streamValidationWorkflow,
  createValidationWorkflow,
} from "./workflow.js";

/**
 * Example 1: Basic workflow execution with output
 */
export async function exampleBasicExecution() {
  console.log("=== Example 1: Basic Workflow Execution ===\n");

  const providerData = {
    name: "Dr. Sarah Johnson",
    npi: "1234567890",
    address: "456 Medical Plaza Drive, New York, NY 10001",
    phone: "+1-212-555-0100",
    website: "https://www.drsarahjohnson.com",
    specialty: "Cardiology",
    state: "NY",
  };

  try {
    const result = await executeValidationWorkflow(providerData, {
      providerId: "provider_john_doe_001",
      verbose: true,
    });

    if (result.success) {
      const state = result.state;

      console.log("\n=== WORKFLOW COMPLETED SUCCESSFULLY ===");
      console.log(`Workflow ID: ${state.workflowId}`);
      console.log(
        `Execution Time: ${result.executionTime}ms (${result.stepsExecuted} steps)`
      );
      console.log(`Status: ${state.workflowStatus}`);
      console.log(`Directory Status: ${state.directoryStatus}`);
      console.log(
        `Overall Confidence: ${state.overallConfidenceScore}%`
      );
      console.log(`Needs Human Review: ${state.needsHumanReview}`);

      if (state.needsHumanReview) {
        console.log(`Review Severity: ${state.reviewSeverity}`);
        console.log(`Priority Score: ${state.priorityScore}`);
        console.log(`Review Tasks Created: ${state.reviewerTasks.length}`);
        console.log(`Alerts Generated: ${state.alerts.length}`);
      } else {
        console.log("✓ Provider auto-published to directory");
        console.log(
          `Web Entry: ${state.webDirectoryEntry?.name} (${state.webDirectoryEntry?.specialty})`
        );
        console.log(
          `Location: ${state.webDirectoryEntry?.location?.coordinates}`
        );
      }

      console.log(`\nValidation Reports: ${state.validationReports.length}`);
      console.log(`Discrepancies Found: ${state.validationDiscrepancies.length}`);

      return result;
    } else {
      console.error("Workflow failed:", result.error);
      console.error("Stack:", result.stack);
      return result;
    }
  } catch (error) {
    console.error("Execution error:", error.message);
    throw error;
  }
}

/**
 * Example 2: Streaming workflow with real-time callbacks
 */
export async function exampleStreamingExecution() {
  console.log("\n=== Example 2: Streaming Workflow Execution ===\n");

  const providerData = {
    name: "Dr. Michael Chen",
    npi: "9876543210",
    address: "789 Healthcare Center, San Francisco, CA 94105",
    phone: "+1-415-555-0200",
    website: "https://www.drmichaelchen.com",
    specialty: "Internal Medicine",
    state: "CA",
  };

  const stepLog = [];

  try {
    await streamValidationWorkflow(
      providerData,
      (stepInfo) => {
        console.log(`[${stepInfo.timestamp}] Node: ${stepInfo.nodeName}`);
        stepLog.push(stepInfo);
      },
      {
        providerId: "provider_michael_chen_002",
      }
    );

    console.log("\n=== STREAMING COMPLETED ===");
    console.log(`Total Steps: ${stepLog.length}`);
    console.log("Execution Order:", stepLog.map((s) => s.nodeName).join(" → "));

    return stepLog;
  } catch (error) {
    console.error("Streaming error:", error.message);
    throw error;
  }
}

/**
 * Example 3: Accessing individual node outputs
 */
export async function exampleIntermediateResults() {
  console.log("\n=== Example 3: Intermediate Results ===\n");

  const providerData = {
    name: "Dr. Emily Rodriguez",
    npi: "5555555555",
    address: "321 Wellness Avenue, Austin, TX 78701",
    phone: "+1-512-555-0300",
    website: "https://www.dremroriguez.com",
    specialty: "Family Medicine",
    state: "TX",
  };

  try {
    const result = await executeValidationWorkflow(providerData, {
      providerId: "provider_emily_rodriguez_003",
    });

    if (result.success) {
      const state = result.state;

      console.log("=== DATA VALIDATION RESULTS ===");
      console.log(`Valid Fields: ${state.validatedFields.length}`);
      state.validatedFields.forEach((field) => {
        console.log(
          `  - ${field.field}: ${field.verified} (${field.source}, confidence: ${field.confidence})`
        );
      });

      console.log("\n=== INFORMATION ENRICHMENT RESULTS ===");
      console.log(
        `Services Found: ${state.enrichedProviderProfile.services.length}`
      );
      console.log(
        `Telemedicine Available: ${state.enrichedProviderProfile.telemedicineAvailable}`
      );
      console.log(
        `Languages: ${state.enrichedProviderProfile.languagesSpoken.join(", ")}`
      );
      console.log(
        `Location: [${state.geoCoordinates.latitude}, ${state.geoCoordinates.longitude}]`
      );

      console.log("\n=== QUALITY ASSURANCE RESULTS ===");
      console.log("Field Confidence Scores:");
      Object.entries(state.fieldConfidenceScores).forEach(([field, score]) => {
        console.log(`  - ${field}: ${(score * 100).toFixed(2)}%`);
      });

      console.log("\n=== ANOMALY DETECTION ===");
      console.log(`Anomalies Detected: ${state.anomalyDetection.isDetected}`);
      if (state.anomalyDetection.isDetected) {
        state.anomalyDetection.patterns.forEach((pattern) => {
          console.log(`  - ${pattern.type} (${pattern.severity})`);
        });
      }

      console.log("\n=== DIRECTORY MANAGEMENT ===");
      console.log(`Final Status: ${state.directoryStatus}`);
      if (state.directoryStatus === "NEEDS_REVIEW") {
        console.log(`Review Tasks: ${state.reviewerTasks.length}`);
        console.log(`Alerts: ${state.alerts.length}`);
      }

      return state;
    } else {
      console.error("Workflow failed:", result.error);
      return result;
    }
  } catch (error) {
    console.error("Execution error:", error.message);
    throw error;
  }
}

/**
 * Example 4: Batch processing multiple providers
 */
export async function exampleBatchProcessing() {
  console.log("\n=== Example 4: Batch Processing ===\n");

  const providers = [
    {
      name: "Dr. James Wilson",
      npi: "1111111111",
      address: "111 Medical Plaza, Boston, MA 02115",
      phone: "+1-617-555-0400",
      website: "https://www.drjameswilson.com",
      specialty: "Orthopedics",
      state: "MA",
    },
    {
      name: "Dr. Lisa Anderson",
      npi: "2222222222",
      address: "222 Health Center, Chicago, IL 60601",
      phone: "+1-312-555-0500",
      website: "https://www.drlisaanderson.com",
      specialty: "Pediatrics",
      state: "IL",
    },
    {
      name: "Dr. Robert Martinez",
      npi: "3333333333",
      address: "333 Care Clinic, Houston, TX 77001",
      phone: "+1-713-555-0600",
      website: "https://www.drbrobertmartinez.com",
      specialty: "Nephrology",
      state: "TX",
    },
  ];

  const results = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    console.log(`\n[${i + 1}/${providers.length}] Processing: ${provider.name}`);

    try {
      const result = await executeValidationWorkflow(provider, {
        providerId: `provider_batch_${i + 1}`,
        verbose: false,
      });

      if (result.success) {
        const state = result.state;
        results.push({
          providerId: state.providerId,
          name: provider.name,
          status: state.directoryStatus,
          confidence: state.overallConfidenceScore,
          needsReview: state.needsHumanReview,
          executionTime: result.executionTime,
        });

        console.log(
          `  ✓ ${state.directoryStatus} (Confidence: ${state.overallConfidenceScore}%)`
        );
      } else {
        results.push({
          providerId: provider.npi,
          name: provider.name,
          status: "FAILED",
          error: result.error,
        });
        console.log(`  ✗ FAILED: ${result.error}`);
      }
    } catch (error) {
      console.error(`  ✗ ERROR: ${error.message}`);
    }
  }

  console.log("\n=== BATCH SUMMARY ===");
  const published = results.filter((r) => r.status === "PUBLISHED").length;
  const needsReview = results.filter((r) => r.needsReview).length;
  const failed = results.filter((r) => r.status === "FAILED").length;

  console.log(`Total Processed: ${results.length}`);
  console.log(`  - Published: ${published}`);
  console.log(`  - Needs Review: ${needsReview}`);
  console.log(`  - Failed: ${failed}`);
  console.log(
    `Average Confidence: ${(results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length).toFixed(2)}%`
  );

  return results;
}

/**
 * Example 5: Error handling and recovery
 */
export async function exampleErrorHandling() {
  console.log("\n=== Example 5: Error Handling ===\n");

  // Provider with missing critical fields
  const incompleteProvider = {
    name: "Dr. Unknown",
    npi: null, // Missing NPI
    address: null, // Missing address
    phone: null, // Missing phone
    website: null, // Missing website
    specialty: "Unknown",
    state: null, // Missing state
  };

  try {
    const result = await executeValidationWorkflow(incompleteProvider, {
      providerId: "provider_incomplete_001",
      verbose: false,
    });

    if (result.success) {
      const state = result.state;

      console.log("Workflow Completed (but with data issues)");
      console.log(`Status: ${state.directoryStatus}`);
      console.log(`Needs Review: ${state.needsHumanReview}`);
      console.log(`Confidence: ${state.overallConfidenceScore}%`);

      if (state.errorLog.length > 0) {
        console.log("\nErrors Encountered:");
        state.errorLog.forEach((error) => {
          console.log(
            `  - [${error.stage}] ${error.error} (${error.timestamp})`
          );
        });
      }

      console.log("\nAnomalies Detected:");
      state.anomalyDetection.patterns.forEach((pattern) => {
        console.log(`  - ${pattern.type}: ${JSON.stringify(pattern)}`);
      });

      return state;
    } else {
      console.error("Workflow failed:", result.error);
      return result;
    }
  } catch (error) {
    console.error("Error handling:", error.message);
    throw error;
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║       LangGraph Provider Validation Workflow Examples       ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    // Example 1
    await exampleBasicExecution();

    // Example 2
    await exampleStreamingExecution();

    // Example 3
    await exampleIntermediateResults();

    // Example 4
    await exampleBatchProcessing();

    // Example 5
    await exampleErrorHandling();

    console.log(
      "\n╔════════════════════════════════════════════════════════════╗"
    );
    console.log("║                    ALL EXAMPLES COMPLETED                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
  } catch (error) {
    console.error("Examples execution error:", error.message);
    throw error;
  }
}

// Uncomment to run examples:
// runAllExamples().catch(console.error);
