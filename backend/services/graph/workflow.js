/**
 * LangGraph Workflow Definition
 * Implements a real stateful validation pipeline with conditional routing.
 */

import { StateGraph, END } from "@langchain/langgraph";
import { dataValidationNode } from "./dataValidationNode.js";
import { informationEnrichmentNode } from "./informationEnrichmentNode.js";
import { qualityAssuranceNode } from "./qualityAssuranceNode.js";
import { needsReviewNode } from "./needsReviewNode.js";
import { directoryManagementNode } from "./directoryManagementNode.js";
import { initializeState } from "./state.js";
import { initLangSmith, createWorkflowRun, logWorkflowCompletion, exportExecutionTrace } from "../tools/langsmithClient.js";

initLangSmith();

export function createValidationWorkflow() {
  const graph = new StateGraph({
    channels: {
      providerId: { value: (x, y) => y ?? x, default: () => "" },
      inputData: { value: (x, y) => y ?? x, default: () => ({}) },
      normalizedData: { value: (x, y) => y ?? x, default: () => ({}) },
      validationResults: { value: (x, y) => y ?? x, default: () => ({}) },
      validationDiscrepancies: { value: (x, y) => y ?? x, default: () => [] },
      validationSources: { value: (x, y) => y ?? x, default: () => [] },
      externalResults: { value: (x, y) => y ?? x, default: () => ({}) },
      confidence: { value: (x, y) => y ?? x, default: () => ({}) },
      needsHumanReview: { value: (x, y) => y ?? x, default: () => false },
      reviewSeverity: { value: (x, y) => y ?? x, default: () => null },
      decision: { value: (x, y) => y ?? x, default: () => ({}) },
      directoryStatus: { value: (x, y) => y ?? x, default: () => null },
      alerts: { value: (x, y) => y ?? x, default: () => [] },
      validationReports: { value: (x, y) => y ?? x, default: () => [] },
      workflowId: { value: (x, y) => y ?? x, default: () => "" },
      runId: { value: (x, y) => y ?? x, default: () => null },
      traceId: { value: (x, y) => y ?? x, default: () => null },
      startTime: { value: (x, y) => y ?? x, default: () => new Date() },
      endTime: { value: (x, y) => y ?? x, default: () => null },
      workflowStatus: { value: (x, y) => y ?? x, default: () => "STARTED" },
      errorLog: { value: (x, y) => y ?? x, default: () => [] },
      nodeExecutionOrder: { value: (x, y) => y ?? x, default: () => [] },
    },
  });

  graph.addNode("data_validation", dataValidationNode);
  graph.addNode("information_enrichment", informationEnrichmentNode);
  graph.addNode("quality_assurance", qualityAssuranceNode);
  graph.addNode("needs_review", needsReviewNode);
  graph.addNode("directory_management", directoryManagementNode);

  graph.addEdge("data_validation", "information_enrichment");
  graph.addEdge("information_enrichment", "quality_assurance");

  graph.addConditionalEdges(
    "quality_assurance",
    routeAfterQA,
    {
      needs_review: "needs_review",
      approved: "directory_management",
    }
  );

  graph.addEdge("needs_review", "directory_management");
  graph.addEdge("directory_management", END);

  graph.setEntryPoint("data_validation");

  return graph.compile();
}

function routeAfterQA(state) {
  const threshold = 0.65;
  const score = state.confidence?.finalScore ?? 0;

  if (score >= threshold && !state.needsHumanReview) {
    return "approved";
  }

  return "needs_review";
}

export async function executeValidationWorkflow(inputData, options = {}) {
  const {
    providerId = inputData.providerId || `provider_${Date.now()}`,
    runId = null,
  } = options;

  const workflowId = `wf_${Date.now()}`;
  const runInfo = await createWorkflowRun(workflowId, providerId, inputData);

  const workflow = createValidationWorkflow();

  const initialState = initializeState(providerId, inputData, {
    workflowId,
    runId: runInfo?.id || runId,
    traceId: runInfo?.traceId || null,
  });

  let finalState = null;
  const executionSteps = [];

  try {
    for await (const step of await workflow.stream(initialState)) {
      const nodeName = Object.keys(step)[0];
      const nodeState = step[nodeName];

      executionSteps.push({
        nodeName,
        timestamp: new Date().toISOString(),
      });

      finalState = nodeState;
    }

    await logWorkflowCompletion(workflowId, providerId, executionSteps, true, null);

    return {
      success: true,
      state: finalState,
      executionSteps,
    };
  } catch (error) {
    await logWorkflowCompletion(workflowId, providerId, executionSteps, false, error);

    return {
      success: false,
      error: error.message,
      state: finalState,
    };
  }
}

export async function streamValidationWorkflow(inputData, onStep, options = {}) {
  const {
    providerId = inputData.providerId || `provider_${Date.now()}`,
    runId = null,
  } = options;

  const workflowId = `wf_${Date.now()}`;
  const runInfo = await createWorkflowRun(workflowId, providerId, inputData);
  const workflow = createValidationWorkflow();

  const initialState = initializeState(providerId, inputData, {
    workflowId,
    runId: runInfo?.id || runId,
    traceId: runInfo?.traceId || null,
  });

  for await (const step of await workflow.stream(initialState)) {
    const nodeName = Object.keys(step)[0];
    const nodeState = step[nodeName];
    onStep({
      nodeName,
      state: nodeState,
      timestamp: new Date().toISOString(),
    });
  }
}

export { exportExecutionTrace };
