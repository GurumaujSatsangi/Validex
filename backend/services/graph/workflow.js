/**
 * LangGraph Workflow Definition
 * Orchestrates the provider validation pipeline with proper state transitions
 * and conditional routing based on Quality Assurance decisions
 * Integrated with LangSmith for tracing node execution order and sequence
 */

import { StateGraph, END } from "@langchain/langgraph";
import { dataValidationNode } from "./dataValidationNode.js";
import { informationEnrichmentNode } from "./informationEnrichmentNode.js";
import { qualityAssuranceNode } from "./qualityAssuranceNode.js";
import { directoryManagementNode } from "./directoryManagementNode.js";
import { Client as LangSmithClient } from "langsmith";
import {
  initLangSmith,
  getLangSmithClient,
  createWorkflowRun,
  logNodeExecution,
  logWorkflowCompletion,
  exportExecutionTrace,
  getActiveTraceId,
  getActiveRunId,
} from "../tools/langsmithClient.js";

/**
 * Initialize LangSmith client for tracing
 */
let langSmithClient = null;
let langSmithEnabled = false;

function initializeLangSmith() {
  try {
    langSmithClient = initLangSmith();
    langSmithEnabled = langSmithClient !== null;
  } catch (error) {
    console.error("[LangSmith] Initialization failed:", error.message);
    langSmithEnabled = false;
  }
}

/**
 * Create the validation workflow graph
 * Returns a compiled graph ready for execution
 */
export function createValidationWorkflow() {
  // Initialize LangSmith on first graph creation
  if (!langSmithEnabled) {
    initializeLangSmith();
  }

  /**
   * Wrap a node with LangSmith tracing
   */
  function createTracedNode(nodeName, originalNode) {
    return async (state) => {
      const startTimeMs = Date.now();
      const startTimeISO = new Date(startTimeMs).toISOString();

      try {
        // Log node execution start
        console.log(`[LangSmith] Executing node: ${nodeName}`);

        // Execute the original node
        const result = originalNode(state);

        // Handle async/Promise results
        const resolvedResult = result instanceof Promise ? await result : result;

        // Record execution end
        const endTimeMs = Date.now();
        const durationMs = endTimeMs - startTimeMs;
        const executionRecord = {
          nodeName,
          timestamp: startTimeISO,
          duration_ms: durationMs,
          order: (state.nodeExecutionOrder || []).length + 1,
        };

        // Log to LangSmith
        await logNodeExecution(nodeName, {
          workflowId: state.workflowId,
          providerId: state.providerId,
          duration: durationMs,
          startTime: startTimeISO,
          endTime: new Date(endTimeMs).toISOString(),
          success: true,
        });

        // Update state with execution order tracking
        const updatedState = {
          ...resolvedResult,
          nodeExecutionOrder: [
            ...(state.nodeExecutionOrder || []),
            executionRecord,
          ],
        };

        console.log(`[LangSmith] Node '${nodeName}' completed in ${executionRecord.duration_ms}ms`);

        return updatedState;
      } catch (error) {
        console.error(`[LangSmith] Error in node '${nodeName}':`, error.message);

        // Record execution end with error
        const endTimeMs = Date.now();
        const durationMs = endTimeMs - startTimeMs;
        const executionRecord = {
          nodeName,
          timestamp: startTimeISO,
          duration_ms: durationMs,
          order: (state.nodeExecutionOrder || []).length + 1,
          error: error.message,
        };

        // Update state with error logging
        return {
          ...state,
          nodeExecutionOrder: [
            ...(state.nodeExecutionOrder || []),
            executionRecord,
          ],
          errorLog: [
            ...(state.errorLog || []),
            {
              nodeName,
              error: error.message,
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }
    };
  }

  // Create state graph with proper state schema
  const graph = new StateGraph({
    channels: {
      providerId: {
        value: (x, y) => y ?? x,
        default: () => "",
      },
      inputData: {
        value: (x, y) => y ?? x,
        default: () => ({}),
      },
      validatedFields: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      validationDiscrepancies: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      validationSources: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      npiLookupResult: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      licensingBoardResult: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      websiteScrapingResult: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      phoneVerificationResult: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      enrichedProviderProfile: {
        value: (x, y) => y ?? x,
        default: () => ({
          services: [],
          telemedicineAvailable: null,
          languagesSpoken: [],
          additionalSpecialties: [],
          acceptedInsurance: [],
          appointmentBookingUrl: null,
        }),
      },
      geoCoordinates: {
        value: (x, y) => y ?? x,
        default: () => ({
          latitude: null,
          longitude: null,
          confidence: null,
        }),
      },
      poiMetadata: {
        value: (x, y) => y ?? x,
        default: () => ({
          businessName: null,
          formattedAddress: null,
          phone: null,
          website: null,
          ratingScore: null,
          reviewCount: null,
        }),
      },
      educationDetails: {
        value: (x, y) => y ?? x,
        default: () => ({
          medicalSchool: null,
          residency: null,
          boardCertifications: [],
        }),
      },
      geoSpecialtyAnalysis: {
        value: (x, y) => y ?? x,
        default: () => ({
          coverageAreas: [],
          practiceType: null,
        }),
      },
      fieldConfidenceScores: {
        value: (x, y) => y ?? x,
        default: () => ({}),
      },
      overallConfidenceScore: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      needsHumanReview: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      reviewSeverity: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      priorityScore: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      anomalyDetection: {
        value: (x, y) => y ?? x,
        default: () => ({
          isDetected: false,
          anomalies: [],
          fraudRisk: "LOW",
        }),
      },
      crossSourceComparison: {
        value: (x, y) => y ?? x,
        default: () => ({}),
      },
      directoryStatus: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      alerts: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      reviewerTasks: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      validationReports: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      webDirectoryEntry: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      mobileAppFeed: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      complianceReportUri: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      workflowId: {
        value: (x, y) => y ?? x,
        default: () => "",
      },
      startTime: {
        value: (x, y) => y ?? x,
        default: () => new Date(),
      },
      endTime: {
        value: (x, y) => y ?? x,
        default: () => null,
      },
      workflowStatus: {
        value: (x, y) => y ?? x,
        default: () => "STARTED",
      },
      errorLog: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
      nodeExecutionOrder: {
        value: (x, y) => y ?? x,
        default: () => [],
      },
    },
  });

  // Add nodes in strict order with LangSmith tracing
  graph.addNode("data_validation", createTracedNode("data_validation", dataValidationNode));
  graph.addNode("information_enrichment", createTracedNode("information_enrichment", informationEnrichmentNode));
  graph.addNode("quality_assurance", createTracedNode("quality_assurance", qualityAssuranceNode));
  graph.addNode("directory_management", createTracedNode("directory_management", directoryManagementNode));

  // Define edges in workflow order
  graph.addEdge("data_validation", "information_enrichment");
  graph.addEdge("information_enrichment", "quality_assurance");

  // Conditional edge: Route based on QA decision
  // Both paths lead to directory management (which handles both publish and review cases)
  graph.addConditionalEdges(
    "quality_assurance",
    routeOnReviewDecision,
    {
      needs_review: "directory_management",
      no_review: "directory_management",
    }
  );

  // End after directory management
  graph.addEdge("directory_management", END);

  // Set starting point
  graph.setEntryPoint("data_validation");

  // Compile and return
  return graph.compile();
}

/**
 * Conditional routing function
 * Routes based on QA decision (both paths eventually reach directory management)
 * This is included for clarity even though both paths converge
 */
function routeOnReviewDecision(state) {
  if (state.needsHumanReview) {
    return "needs_review";
  } else {
    return "no_review";
  }
}

/**
 * Execute the workflow with input data
 * @param {Object} inputData - Provider data object
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Final workflow state
 */
export async function executeValidationWorkflow(inputData, options = {}) {
  try {
    const {
      providerId = `provider_${Date.now()}`,
      verbose = false,
      timeout = 60000,
    } = options;

    // Create LangSmith run and capture IDs
    const runInfo = await createWorkflowRun(`wf_${Date.now()}`, providerId, inputData);
    const runId = runInfo?.id || null;
    const traceId = runInfo?.traceId || null;

    // Initialize workflow
    const workflow = createValidationWorkflow();

    // Prepare initial state
    const initialState = {
      providerId,
      runId,
      traceId,
      inputData: {
        name: inputData.name || null,
        npi: inputData.npi || null,
        address: inputData.address || null,
        phone: inputData.phone || null,
        website: inputData.website || null,
        specialty: inputData.specialty || null,
        state: inputData.state || null,
      },
      validatedFields: [],
      validationDiscrepancies: [],
      validationSources: [],
      npiLookupResult: null,
      licensingBoardResult: null,
      websiteScrapingResult: null,
      phoneVerificationResult: null,
      enrichedProviderProfile: {
        services: [],
        telemedicineAvailable: null,
        languagesSpoken: [],
        additionalSpecialties: [],
        acceptedInsurance: [],
        appointmentBookingUrl: null,
      },
      geoCoordinates: {
        latitude: null,
        longitude: null,
        confidence: null,
      },
      poiMetadata: {
        businessName: null,
        formattedAddress: null,
        phone: null,
        website: null,
        ratingScore: null,
        reviewCount: null,
      },
      educationDetails: {
        medicalSchool: null,
        residency: null,
        boardCertifications: [],
      },
      geoSpecialtyAnalysis: {
        coverageAreas: [],
        practiceType: null,
      },
      fieldConfidenceScores: {},
      overallConfidenceScore: null,
      needsHumanReview: null,
      reviewSeverity: null,
      priorityScore: null,
      anomalyDetection: {
        isDetected: false,
        anomalies: [],
        fraudRisk: "LOW",
      },
      crossSourceComparison: {},
      directoryStatus: null,
      alerts: [],
      reviewerTasks: [],
      validationReports: [],
      webDirectoryEntry: null,
      mobileAppFeed: null,
      complianceReportUri: null,
      workflowId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date(),
      endTime: null,
      workflowStatus: "STARTED",
      errorLog: [],
      nodeExecutionOrder: [],
    };

    if (verbose) {
      console.log("[Workflow] Initialized with state:", JSON.stringify(initialState, null, 2));
    }

    // Execute workflow
    let finalState = null;
    let stepCount = 0;

    for await (const state of await workflow.stream(initialState)) {
      stepCount++;

      if (verbose) {
        console.log(`[Workflow] Step ${stepCount}:`, Object.keys(state)[0]);
        console.log(JSON.stringify(state, null, 2));
      }

      finalState = state;
    }

    if (verbose) {
      console.log("[Workflow] Completed after", stepCount, "steps");
    }

    // Log execution order summary
    if (finalState && finalState.nodeExecutionOrder) {
      console.log("\n[LangSmith] Workflow Execution Order Summary:");
      console.log("=".repeat(70));
      finalState.nodeExecutionOrder.forEach((record, index) => {
        console.log(`${index + 1}. ${record.nodeName} (${record.duration_ms}ms) - ${record.timestamp}`);
        if (record.error) {
          console.log(`   ERROR: ${record.error}`);
        }
      });
      console.log("=".repeat(70));

      // Display run and trace IDs at completion
      console.log(`\n[LangSmith] Run Complete:`);
      console.log(`[LangSmith]   Run ID: ${finalState.runId}`);
      console.log(`[LangSmith]   Trace ID: ${finalState.traceId}`);
      console.log(`[LangSmith]   Provider ID: ${finalState.providerId}`);
      console.log(`${`=`.repeat(70)}\n`);

      // Log workflow completion to LangSmith
      await logWorkflowCompletion(
        finalState.workflowId,
        finalState.providerId,
        finalState.nodeExecutionOrder,
        true,
        null
      );
    }

    // Export execution trace
    const executionTrace = finalState
      ? exportExecutionTrace(finalState.nodeExecutionOrder || [], finalState.workflowId, finalState.providerId)
      : null;

    return {
      success: true,
      state: finalState,
      executionTime: Date.now() - new Date(finalState.startTime).getTime(),
      stepsExecuted: stepCount,
      executionTrace,
    };
  } catch (error) {
    console.error("[Workflow] Execution error:", error.message);

    // Log error to LangSmith
    await logWorkflowCompletion(
      `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      options.providerId || "unknown",
      [],
      false,
      error
    );

    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Stream results from workflow for real-time monitoring
 * @param {Object} inputData - Provider data object
 * @param {Function} onStep - Callback for each workflow step
 * @param {Object} options - Configuration options
 */
export async function streamValidationWorkflow(
  inputData,
  onStep,
  options = {}
) {
  try {
    const { providerId = `provider_${Date.now()}` } = options;

    // Create LangSmith run and capture IDs
    const runInfo = await createWorkflowRun(`wf_${Date.now()}`, providerId, inputData);
    const runId = runInfo?.id || null;
    const traceId = runInfo?.traceId || null;

    const workflow = createValidationWorkflow();

    const initialState = {
      providerId,
      runId,
      traceId,
      inputData: {
        name: inputData.name || null,
        npi: inputData.npi || null,
        address: inputData.address || null,
        phone: inputData.phone || null,
        website: inputData.website || null,
        specialty: inputData.specialty || null,
        state: inputData.state || null,
      },
      validatedFields: [],
      validationDiscrepancies: [],
      validationSources: [],
      npiLookupResult: null,
      licensingBoardResult: null,
      websiteScrapingResult: null,
      phoneVerificationResult: null,
      enrichedProviderProfile: {
        services: [],
        telemedicineAvailable: null,
        languagesSpoken: [],
        additionalSpecialties: [],
        acceptedInsurance: [],
        appointmentBookingUrl: null,
      },
      geoCoordinates: {
        latitude: null,
        longitude: null,
        confidence: null,
      },
      poiMetadata: {
        businessName: null,
        formattedAddress: null,
        phone: null,
        website: null,
        ratingScore: null,
        reviewCount: null,
      },
      educationDetails: {
        medicalSchool: null,
        residency: null,
        boardCertifications: [],
      },
      geoSpecialtyAnalysis: {
        coverageAreas: [],
        practiceType: null,
      },
      fieldConfidenceScores: {},
      overallConfidenceScore: null,
      needsHumanReview: null,
      reviewSeverity: null,
      priorityScore: null,
      anomalyDetection: {
        isDetected: false,
        anomalies: [],
        fraudRisk: "LOW",
      },
      crossSourceComparison: {},
      directoryStatus: null,
      alerts: [],
      reviewerTasks: [],
      validationReports: [],
      webDirectoryEntry: null,
      mobileAppFeed: null,
      complianceReportUri: null,
      workflowId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: new Date(),
      endTime: null,
      workflowStatus: "STARTED",
      errorLog: [],
      nodeExecutionOrder: [],
    };

    for await (const state of await workflow.stream(initialState)) {
      const nodeName = Object.keys(state)[0];
      onStep({
        nodeName,
        state: state[nodeName],
        nodeExecutionOrder: state.nodeExecutionOrder,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("[Workflow Stream] Error:", error.message);
    throw error;
  }
}

/**
 * Export LangSmith tracing utilities
 */
export { initLangSmith, getLangSmithClient, logNodeExecution, logWorkflowCompletion, exportExecutionTrace };
