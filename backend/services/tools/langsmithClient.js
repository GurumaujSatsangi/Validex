/**
 * LangSmith Client Utilities
 * Provides centralized tracing and monitoring for the workflow
 */

import { Client as LangSmithClient } from "langsmith";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

let client = null;
let isInitialized = false;
let activeRun = null;
let activeRunId = null;
let activeTraceId = null;
let projectName = null;
let apiKey = null;

/**
 * Initialize LangSmith client
 */
export function initLangSmith() {
  if (isInitialized && client) return client;

  try {
    apiKey = process.env.LANGSMITH_API_KEY;
    const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";

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
 * Get the active trace ID
 */
export function getActiveTraceId() {
  return activeTraceId;
}

/**
 * Get the active run ID
 */
export function getActiveRunId() {
  return activeRunId;
}

/**
 * Create a workflow run in LangSmith using the API
 */
export async function createWorkflowRun(workflowId, providerId, inputData) {
  const langClient = getLangSmithClient();
  
  // Generate a unique trace ID for this run
  const traceId = uuidv4();
  const runId = uuidv4();
  activeTraceId = traceId;
  activeRunId = runId;
  
  // Always log locally first
  console.log(`\n${`=`.repeat(70)}`);
  console.log(`[LangSmith] ✓ Workflow started: validation_${providerId}`);
  
  if (!langClient) {
    console.log(`[LangSmith] ⚠ Local tracing mode (no API key configured)`);
    console.log(`[LangSmith] Run ID: ${runId}`);
    console.log(`[LangSmith] Trace ID: ${traceId}`);
    console.log(`${`=`.repeat(70)}\n`);
    return { id: runId, traceId };
  }

  try {
    // Create the run via LangSmith API
    const runData = {
      id: runId,
      name: `validation_${providerId}`,
      run_type: "chain",
      inputs: {
        providerId,
        inputData,
      },
      project_name: projectName,
      tags: ["truelens", "validation", providerId],
      extra: {
        providerId,
        workflowId,
      },
    };

    // Use the client's createRun method
    const run = await langClient.createRun(runData);
    
    activeRun = run;
    
    console.log(`[LangSmith] Run ID: ${runId}`);
    console.log(`[LangSmith] Trace ID: ${traceId}`);
    console.log(`[LangSmith] 📊 View trace at: https://smith.langchain.com/o/runs/${runId}`);
    console.log(`${`=`.repeat(70)}\n`);
    return { id: runId, traceId };
  } catch (error) {
    console.error("[LangSmith] ✗ Error creating run:", error.message);
    console.log(`[LangSmith] Run ID: ${runId}`);
    console.log(`[LangSmith] Trace ID: ${traceId}`);
    console.log(`${`=`.repeat(70)}\n`);
    return { id: runId, traceId };
  }
}

/**
 * Log node execution to LangSmith as a child run
 */
export async function logNodeExecution(nodeName, execution) {
  const langClient = getLangSmithClient();
  
  console.log(`[LangSmith] ✓ Node '${nodeName}' executed (${execution.duration}ms)`);
  
  if (!langClient || !activeRunId) {
    return { id: `local_${nodeName}` };
  }

  try {
    const nodeRunId = uuidv4();
    const startTime = new Date(execution.startTime);
    const endTime = new Date(execution.startTime);
    endTime.setMilliseconds(endTime.getMilliseconds() + execution.duration);

    // Create child run for the node
    const nodeRunData = {
      id: nodeRunId,
      name: nodeName,
      run_type: "llm",
      parent_run_id: activeRunId,
      start_time: startTime,
      end_time: endTime,
      inputs: {
        nodeName,
        workflowId: execution.workflowId,
        providerId: execution.providerId,
      },
      outputs: {
        status: "completed",
        duration_ms: execution.duration,
      },
      project_name: projectName,
      tags: ["node", nodeName],
      extra: {
        nodeName,
        duration: execution.duration,
      },
    };

    const nodeRun = await langClient.createRun(nodeRunData);
    
    console.log(`[LangSmith]   Node run created: ${nodeRunId}`);
    return { id: nodeRunId };
  } catch (error) {
    console.error(`[LangSmith] ✗ Error logging node:`, error.message);
    return { id: `local_${nodeName}` };
  }
}

/**
 * Log workflow completion to LangSmith
 */
export async function logWorkflowCompletion(workflowId, providerId, nodeExecutionOrder, success, errorMsg) {
  const langClient = getLangSmithClient();

  try {
    const totalDuration = nodeExecutionOrder.reduce((sum, node) => sum + (node.duration_ms || 0), 0);
    const nodeSequence = nodeExecutionOrder.map((n) => n.nodeName).join(" → ");

    console.log(`[LangSmith] ✓ Workflow completed`);
    console.log(`[LangSmith]   Duration: ${totalDuration}ms`);
    console.log(`[LangSmith]   Sequence: ${nodeSequence}`);
    console.log(`[LangSmith]   Dashboard: https://smith.langchain.com/`);

    if (!langClient || !activeRunId) {
      activeRunId = null;
      activeRun = null;
      return true;
    }

    try {
      // Update the parent run with completion data
      await langClient.updateRun(activeRunId, {
        end_time: new Date(),
        outputs: {
          status: success ? "completed" : "failed",
          totalDuration,
          nodeSequence,
          nodeExecutionOrder: nodeExecutionOrder.map((n) => ({
            order: n.order,
            nodeName: n.nodeName,
            duration_ms: n.duration_ms,
          })),
        },
        error: errorMsg ? errorMsg.message || String(errorMsg) : null,
      });

      console.log(`[LangSmith] ✓ Run updated on dashboard`);
    } catch (updateError) {
      console.error("[LangSmith] ⚠ Could not update run on dashboard:", updateError.message);
    }

    // Mark workflow as complete
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
 * Alias for logWorkflowCompletion
 */
export const completeWorkflowRun = logWorkflowCompletion;

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

