/**
 * LangGraph Workflow Definition
 * Orchestrates the provider validation pipeline with proper state transitions
 * and conditional routing based on Quality Assurance decisions
 */

import { StateGraph, END } from "@langchain/langgraph";
import { dataValidationNode } from "./dataValidationNode.js";
import { informationEnrichmentNode } from "./informationEnrichmentNode.js";
import { qualityAssuranceNode } from "./qualityAssuranceNode.js";
import { directoryManagementNode } from "./directoryManagementNode.js";

/**
 * Create the validation workflow graph
 * Returns a compiled graph ready for execution
 */
export function createValidationWorkflow() {
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
    },
  });

  // Add nodes in strict order
  graph.addNode("data_validation", dataValidationNode);
  graph.addNode("information_enrichment", informationEnrichmentNode);
  graph.addNode("quality_assurance", qualityAssuranceNode);
  graph.addNode("directory_management", directoryManagementNode);

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

    // Initialize workflow
    const workflow = createValidationWorkflow();

    // Prepare initial state
    const initialState = {
      providerId,
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

    return {
      success: true,
      state: finalState,
      executionTime: Date.now() - new Date(finalState.startTime).getTime(),
      stepsExecuted: stepCount,
    };
  } catch (error) {
    console.error("[Workflow] Execution error:", error.message);
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

    const workflow = createValidationWorkflow();

    const initialState = {
      providerId,
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
    };

    for await (const state of await workflow.stream(initialState)) {
      const nodeName = Object.keys(state)[0];
      onStep({
        nodeName,
        state: state[nodeName],
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("[Workflow Stream] Error:", error.message);
    throw error;
  }
}
