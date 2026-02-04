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

/**
 * Initialize LangSmith client
 */
export function initLangSmith() {
  if (isInitialized) return client;

  try {
    const apiKey = process.env.LANGSMITH_API_KEY;
    const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    const projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";

    if (apiKey) {
      client = new LangSmithClient({
        apiKey,
        apiUrl: endpoint,
        projectName,
      });
      isInitialized = true;
      console.log(`[LangSmith] ✓ Connected to LangSmith`);
      console.log(`[LangSmith]   Project: ${projectName}`);
      console.log(`[LangSmith]   Endpoint: ${endpoint}`);
      console.log(`[LangSmith]   Dashboard: https://smith.langchain.com/`);
      return client;
    } else {
      console.log("[LangSmith] ⚠ LANGSMITH_API_KEY not set. Local tracing only.");
      return null;
    }
  } catch (error) {
    console.error("[LangSmith] ✗ Initialization error:", error.message);
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
 * Create a run for tracking workflow execution
 */
export async function createWorkflowRun(workflowId, providerId, inputData) {
  const langClient = getLangSmithClient();
  if (!langClient) {
    console.log(`[LangSmith] Creating local trace for workflow ${workflowId}`);
    return null;
  }

  try {
    activeRun = await langClient.createRun({
      name: `validation_${providerId}`,
      run_type: "chain",
      inputs: {
        providerId,
        ...inputData,
      },
      metadata: {
        workflowId,
        providerId,
        type: "provider_validation",
      },
    });

    console.log(`[LangSmith] ✓ Run created: ${activeRun.id}`);
    console.log(`[LangSmith]   View at: https://smith.langchain.com/`);
    return activeRun;
  } catch (error) {
    console.error("[LangSmith] ✗ Error creating run:", error.message);
    return null;
  }
}

/**
 * Log node execution to LangSmith
 */
export async function logNodeExecution(nodeName, execution) {
  const langClient = getLangSmithClient();
  if (!langClient || !activeRun) {
    console.log(`[LangSmith] Local node trace: ${nodeName} (${execution.duration}ms)`);
    return;
  }

  try {
    const { workflowId, providerId, duration, startTime, endTime, success, error } = execution;

    // Create a child run for the node
    const nodeRun = await langClient.createRun({
      name: nodeName,
      run_type: "tool",
      parent_run_id: activeRun.id,
      inputs: {
        workflow_id: workflowId,
        provider_id: providerId,
      },
      outputs: success
        ? {
            status: "completed",
            duration_ms: duration,
          }
        : null,
      error: error ? error.message : null,
      start_time: new Date(startTime),
      end_time: new Date(endTime),
      metadata: {
        node_name: nodeName,
        duration_ms: duration,
        success,
      },
    });

    console.log(`[LangSmith] ✓ Node '${nodeName}' logged (${duration}ms)`);
    return nodeRun;
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

    if (!langClient || !activeRun) {
      console.log(`[LangSmith] Workflow completed (local trace):`, {
        workflow: workflowId,
        provider: providerId,
        success,
        totalDuration_ms: totalDuration,
        nodeCount: nodeExecutionOrder.length,
        nodeSequence,
      });
      return;
    }

    // Update the main run with completion info
    await langClient.updateRun(activeRun.id, {
      outputs: {
        status: success ? "completed" : "error",
        total_duration_ms: totalDuration,
        node_count: nodeExecutionOrder.length,
        node_sequence: nodeSequence,
        nodes: nodeExecutionOrder.map((n) => ({
          name: n.nodeName,
          duration_ms: n.duration_ms,
          order: n.order,
          error: n.error || null,
        })),
      },
      error: error ? error.message : null,
      end_time: new Date(),
      metadata: {
        total_duration_ms: totalDuration,
        node_count: nodeExecutionOrder.length,
      },
    });

    console.log(`[LangSmith] ✓ Workflow completed and logged to LangSmith`);
    activeRun = null;
    return true;
  } catch (error) {
    console.error("[LangSmith] ✗ Error logging workflow completion:", error.message);
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
