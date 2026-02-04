/**
 * LangSmith Tracing - Example Usage
 * Demonstrates how to use the integrated tracing system
 */

import {
  executeValidationWorkflow,
  streamValidationWorkflow,
  exportExecutionTrace,
  initLangSmith,
} from "./workflow.js";

/**
 * Example 1: Basic workflow execution with trace export
 */
export async function exampleBasicExecution() {
  console.log("\n=== Example 1: Basic Execution with Trace ===\n");

  const inputData = {
    name: "Dr. John Smith",
    npi: "1234567890",
    address: "123 Medical Plaza, New York, NY 10001",
    phone: "212-555-0123",
    website: "https://drjohnsmith.com",
    specialty: "Cardiology",
    state: "NY",
  };

  try {
    const result = await executeValidationWorkflow(inputData, {
      providerId: "provider_smith_001",
      verbose: false, // Set to true for detailed logs
    });

    if (result.success) {
      console.log("\n✓ Workflow executed successfully");
      console.log(`Total execution time: ${result.executionTime}ms`);
      console.log(`Total steps: ${result.stepsExecuted}`);

      // Display execution trace
      if (result.executionTrace) {
        console.log("\nExecution Trace:");
        console.log(JSON.stringify(result.executionTrace, null, 2));

        // Display in human-readable format
        console.log("\nNode Execution Sequence:");
        result.executionTrace.detailedExecution.forEach((exec) => {
          console.log(
            `  ${exec.order}. ${exec.nodeName} - ${exec.durationFormatted}${exec.error ? ` ❌ Error: ${exec.error}` : ""}`
          );
        });
      }
    } else {
      console.error("✗ Workflow failed:", result.error);
    }
  } catch (error) {
    console.error("Error running example:", error.message);
  }
}

/**
 * Example 2: Streaming execution with real-time monitoring
 */
export async function exampleStreamingExecution() {
  console.log("\n=== Example 2: Streaming Execution (Real-time Monitoring) ===\n");

  const inputData = {
    name: "Dr. Jane Doe",
    npi: "0987654321",
    address: "456 Health Center, Los Angeles, CA 90001",
    phone: "213-555-0456",
    website: "https://drjanedoe.com",
    specialty: "Internal Medicine",
    state: "CA",
  };

  const startTime = Date.now();
  let nodeCount = 0;

  try {
    await streamValidationWorkflow(
      inputData,
      (step) => {
        nodeCount++;
        const elapsed = Date.now() - startTime;
        console.log(
          `[${elapsed}ms] Step ${nodeCount}: Executing ${step.nodeName}`
        );

        // Display current execution order
        if (step.nodeExecutionOrder && step.nodeExecutionOrder.length > 0) {
          const sequence = step.nodeExecutionOrder
            .map((n) => n.nodeName)
            .join(" → ");
          console.log(`  Execution path so far: ${sequence}`);
        }
      },
      { providerId: "provider_doe_002" }
    );

    console.log(`\n✓ Streaming completed after ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("Error in streaming example:", error.message);
  }
}

/**
 * Example 3: Multiple executions with comparison
 */
export async function exampleMultipleExecutions() {
  console.log("\n=== Example 3: Multiple Executions with Comparison ===\n");

  const providers = [
    {
      name: "Dr. Alice Johnson",
      npi: "1111111111",
      address: "111 Medical Dr, Boston, MA 02101",
      phone: "617-555-0111",
      website: "https://dralicejohnson.com",
      specialty: "Neurology",
      state: "MA",
    },
    {
      name: "Dr. Bob Wilson",
      npi: "2222222222",
      address: "222 Health Ave, Chicago, IL 60601",
      phone: "312-555-0222",
      website: "https://drbobwilson.com",
      specialty: "Pediatrics",
      state: "IL",
    },
    {
      name: "Dr. Carol Martinez",
      npi: "3333333333",
      address: "333 Care Blvd, Houston, TX 77001",
      phone: "713-555-0333",
      website: "https://drbcarolmartinez.com",
      specialty: "Orthopedics",
      state: "TX",
    },
  ];

  const results = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    console.log(
      `\nProcessing provider ${i + 1}/${providers.length}: ${provider.name}`
    );

    try {
      const result = await executeValidationWorkflow(provider, {
        providerId: `provider_${i + 1}`,
        verbose: false,
      });

      if (result.success && result.executionTrace) {
        results.push({
          providerId: provider.name,
          executionTime: result.executionTime,
          nodeCount: result.executionTrace.executionSummary.totalNodes,
          totalDuration:
            result.executionTrace.executionSummary.totalDuration,
          nodeSequence:
            result.executionTrace.executionSummary.nodeSequence,
        });
      }
    } catch (error) {
      console.error(`Error processing ${provider.name}:`, error.message);
    }
  }

  // Display comparison
  console.log("\n=== Execution Comparison ===");
  console.log(
    "Provider | Execution Time | Nodes | Total Duration | Sequence"
  );
  console.log("-".repeat(80));
  results.forEach((r) => {
    console.log(
      `${r.providerId.padEnd(20)} | ${r.executionTime.toString().padEnd(14)} | ${r.nodeCount} | ${r.totalDuration}ms | ${r.nodeSequence.substring(0, 30)}...`
    );
  });

  // Calculate averages
  if (results.length > 0) {
    const avgTime =
      results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
    const avgDuration =
      results.reduce((sum, r) => sum + r.totalDuration, 0) / results.length;
    console.log("\nAverages:");
    console.log(`  Execution Time: ${avgTime.toFixed(0)}ms`);
    console.log(`  Total Duration: ${avgDuration.toFixed(0)}ms`);
  }
}

/**
 * Example 4: Error handling and debugging
 */
export async function exampleErrorHandling() {
  console.log("\n=== Example 4: Error Handling and Debugging ===\n");

  // Test with incomplete data (intentional error case)
  const invalidInputData = {
    name: "", // Empty name - will cause validation error
    npi: "invalid-npi", // Invalid NPI format
    address: null,
    phone: null,
    website: null,
    specialty: null,
    state: null,
  };

  try {
    const result = await executeValidationWorkflow(invalidInputData, {
      providerId: "provider_error_test",
      verbose: true, // Enable verbose logging
    });

    console.log("\nResult Status:", result.success ? "✓ Success" : "✗ Failed");

    if (!result.success) {
      console.log("Error Message:", result.error);
      console.log("Error Stack:", result.stack);
    } else if (result.executionTrace) {
      // Check for errors in trace
      const errorsInTrace = result.executionTrace.detailedExecution.filter(
        (e) => e.error
      );

      if (errorsInTrace.length > 0) {
        console.log("\nErrors encountered during execution:");
        errorsInTrace.forEach((e) => {
          console.log(
            `  - ${e.nodeName}: ${e.error}`
          );
        });
      }

      // Display execution order even if there were errors
      console.log("\nPartial Execution Order:");
      result.executionTrace.detailedExecution.forEach((exec) => {
        console.log(
          `  ${exec.order}. ${exec.nodeName} - ${exec.durationFormatted}`
        );
      });
    }
  } catch (error) {
    console.error("Fatal error:", error.message);
  }
}

/**
 * Example 5: LangSmith Configuration Check
 */
export async function exampleConfigurationCheck() {
  console.log("\n=== Example 5: LangSmith Configuration Check ===\n");

  // Check environment variables
  const apiKey = process.env.LANGSMITH_API_KEY;
  const projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";

  console.log("LangSmith Configuration:");
  console.log(
    `  API Key Set: ${apiKey ? "✓ Yes" : "✗ No"}`
  );
  console.log(`  Project Name: ${projectName}`);

  if (!apiKey) {
    console.log("\n⚠ LangSmith is disabled. To enable:");
    console.log("  1. Set LANGSMITH_API_KEY in your .env file");
    console.log("  2. Get your API key from https://smith.langchain.com/");
    console.log("  3. Restart your application");
    console.log(
      "\nNote: Workflows still work without LangSmith. Local tracing is enabled."
    );
  } else {
    console.log("\n✓ LangSmith is enabled and configured");
    console.log(`  Dashboard: https://smith.langchain.com/o/${projectName}`);
  }

  // Initialize and check
  try {
    const client = initLangSmith();
    console.log(`\n✓ LangSmith client: ${client ? "Initialized" : "Not initialized"}`);
  } catch (error) {
    console.error("LangSmith initialization error:", error.message);
  }
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║      LangSmith Tracing - Comprehensive Examples            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check configuration first
  await exampleConfigurationCheck();

  // Run examples
  await exampleBasicExecution();
  await exampleStreamingExecution();
  await exampleMultipleExecutions();
  await exampleErrorHandling();

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║              All Examples Completed                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
}

// Uncomment to run examples
// runAllExamples().catch(console.error);
