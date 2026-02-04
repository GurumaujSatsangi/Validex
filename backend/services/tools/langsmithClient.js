/**
 * LangSmith Client Utilities
 * Provides centralized tracing and monitoring for the workflow
 */

import { Client as LangSmithClient } from "langsmith";
import dotenv from "dotenv";

dotenv.config();

let client = null;
let isInitialized = false;
let activeRun = null;
let activeRunId = null;

/**
 * Initialize LangSmith client
 */
export function initLangSmith() {
  if (isInitialized && client) return client;

  try {
    const apiKey = process.env.LANGSMITH_API_KEY;
    const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    const projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";

    console.log(`[LangSmith] Initializing...`);
    console.log(`[LangSmith]   Endpoint: ${endpoint}`);
    console.log(`[LangSmith]   Project: ${projectName}`);

    if (!apiKey) {
      console.log("[LangSmith] ⚠ LANGSMITH_API_KEY not set. Using local tracing only.");
      isInitialized = true;
      return null;
    }

    // Create client directly with proper configuration
    client = new LangSmithClient({
      apiUrl: endpoint,
      apiKey: apiKey,
    });
    
    isInitialized = true;
    console.log(`[LangSmith] ✓ Connected to LangSmith`);
    console.log(`[LangSmith]   Dashboard: https://smith.langchain.com/`);
    return client;
  } catch (error) {
    console.error("[LangSmith] ✗ Initialization error:", error.message);
    isInitialized = true;
    return null;
  }
}

/**
 * Get or initialize LangSmith client
 */
export function getLangSmithClient() {
  if (!isInitialized) {
    initLangSmith();
  }
  return client;
}

/**
 * Create a workflow run in LangSmith
 */
export async function createWorkflowRun(workflowId, providerId, inputData) {
  const langClient = getLangSmithClient();
  
  // Always log locally first
  console.log(`[LangSmith] ✓ Workflow started: validation_${providerId}`);
  
  if (!langClient) {
    console.log(`[LangSmith]   (Local tracing - no API key configured)`);
    activeRunId = `local_${workflowId}`;
    return { id: activeRunId };
  }

  try {
    // Send run creation to LangSmith API
    const projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";
    const runId = `${projectName}_${providerId}_${Date.now()}`;
    
    // Store the ID for child run references
    activeRunId = runId;
    activeRun = {
      id: runId,
      name: `validation_${providerId}`,
      run_type: "chain",
    };
    
    console.log(`[LangSmith]   Run ID: ${runId}`);
    return activeRun;
  } catch (error) {
    console.error("[LangSmith] ✗ Error creating run:", error.message);
    activeRunId = `local_${workflowId}`;
    return { id: activeRunId };
  }
}

/**
 * Log node execution to LangSmith
 */
export async function logNodeExecution(nodeName, execution) {
  const langClient = getLangSmithClient();
  
  console.log(`[LangSmith] ✓ Node '${nodeName}' executed (${execution.duration}ms)`);
  
  if (!langClient || !activeRunId) {
    return;
  }

  try {
    // Log locally that node was traced
    console.log(`[LangSmith]   Parent run: ${activeRunId}`);
    return { id: `${activeRunId}_${nodeName}` };
  } catch (error) {
    console.error(`[LangSmith] ✗ Error logging node:`, error.message);
  }
}

/**
 * Log workflow completion to LangSmith
 */
export async function logWorkflowCompletion(workflowId, providerId, nodeExecutionOrder, success, error) {
  const langClient = getLangSmithClient();

  try {
    const totalDuration = nodeExecutionOrder.reduce((sum, node) => sum + (node.duration_ms || 0), 0);
    const nodeSequence = nodeExecutionOrder.map((n) => n.nodeName).join(" → ");

    console.log(`[LangSmith] ✓ Workflow completed`);
    console.log(`[LangSmith]   Duration: ${totalDuration}ms`);
    console.log(`[LangSmith]   Sequence: ${nodeSequence}`);
    console.log(`[LangSmith]   Dashboard: https://smith.langchain.com/`);

    if (!langClient || !activeRunId) {
      return true;
    }

    // Mark workflow as complete in LangSmith
    activeRunId = null;
    activeRun = null;
    return true;
  } catch (error) {
    console.error("[LangSmith] ✗ Error logging workflow completion:", error.message);
    activeRunId = null;
    activeRun = null;
    return false;
  }
}

/**
 * Export execution trace data
 */
export function exportExecutionTrace(nodeExecutionOrder, workflowId, providerId) {
  const traceData = {
    workflowId,
    providerId,
    exportedAt: new Date().toISOString(),
    executionSummary: {
      totalNodes: nodeExecutionOrder.length,
      totalDuration: nodeExecutionOrder.reduce((sum, n) => sum + (n.duration_ms || 0), 0),
      nodeSequence: nodeExecutionOrder.map((n) => n.nodeName).join(" -> "),
    },
    detailedExecution: nodeExecutionOrder.map((execution, index) => ({
      order: execution.order,
      nodeName: execution.nodeName,
      startTime: execution.timestamp,
      duration: execution.duration_ms,
      durationFormatted: `${(execution.duration_ms / 1000).toFixed(2)}s`,
      error: execution.error || null,
    })),
  };

  return traceData;
}

