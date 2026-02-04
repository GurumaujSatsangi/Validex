/**
 * Minimal shared state for the LangGraph workflow
 * All nodes read/write only these fields.
 */

export function initializeState(providerId, inputData, options = {}) {
  const { workflowId, runId, traceId } = options;

  return {
    providerId,
    inputData,
    normalizedData: {},
    validationResults: {},
    validationDiscrepancies: [],
    validationSources: [],
    externalResults: {},
    confidence: {},
    needsHumanReview: false,
    reviewSeverity: null,
    decision: {},
    directoryStatus: null,
    alerts: [],
    validationReports: [],
    workflowId,
    runId,
    traceId,
    startTime: new Date(),
    endTime: null,
    workflowStatus: "STARTED",
    errorLog: [],
    nodeExecutionOrder: [],
  };
}
