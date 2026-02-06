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
export function initLangSmith(silent = false) {
  if (isInitialized && client) return client;

  try {
    apiKey = process.env.LANGSMITH_API_KEY;
    const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    projectName = process.env.LANGSMITH_PROJECT || "truelens-validation";

    if (!silent) {
      console.log(`[LangSmith] Initializing...`);
      console.log(`[LangSmith]   Endpoint: ${endpoint}`);
      console.log(`[LangSmith]   Project: ${projectName}`);
    }

    if (!apiKey) {
      if (!silent) {
        console.log("[LangSmith] ⚠ LANGSMITH_API_KEY not set. Using local tracing only.");
      }
      isInitialized = true;
      return null;
    }

    // Create client directly with proper configuration
    client = new LangSmithClient({
      apiUrl: endpoint,
      apiKey: apiKey,
    });
    
    isInitialized = true;
    if (!silent) {
      console.log(`[LangSmith] ✓ Connected to LangSmith`);
      console.log(`[LangSmith]   Dashboard: https://smith.langchain.com/`);
    }
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
export function getLangSmithClient(silent = false) {
  if (!isInitialized) {
    initLangSmith(silent);
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

/**
 * Fetch latency and token usage metrics for a LangSmith run
 * @param {string} parentRunId - The parent workflow run ID
 * @param {object} pricingConfig - Optional pricing configuration
 * @param {number} pricingConfig.input_cost_per_1k - Cost per 1K input tokens (default: 0.001)
 * @param {number} pricingConfig.output_cost_per_1k - Cost per 1K output tokens (default: 0.002)
 * @returns {Promise<object>} Latency, token usage, and cost metrics
 */
export async function fetchRunMetrics(parentRunId, pricingConfig = {}) {
  const {
    input_cost_per_1k = 0.001,
    output_cost_per_1k = 0.002,
  } = pricingConfig;

  // Get or initialize the LangSmith client (silent mode for metrics)
  const langClient = getLangSmithClient(true);

  if (!langClient) {
    console.error("[LangSmith Metrics] ✗ LangSmith client not initialized");
    return null;
  }

  try {
    // Fetch parent run using client SDK
    const parentRun = await langClient.readRun(parentRunId);

    // Fetch child runs using client SDK with filter
    const childRunsIterator = langClient.listRuns({
      projectName: projectName,
      filter: `eq(parent_run_id, "${parentRunId}")`,
    });

    // Convert async iterator to array
    const childRuns = [];
    for await (const run of childRunsIterator) {
      childRuns.push(run);
    }

    // Calculate latency metrics
    const latency = calculateLatency(parentRun, childRuns);

    // Calculate token usage metrics
    const tokens = calculateTokenUsage(childRuns);

    // Calculate cost
    const cost = calculateCost(tokens, input_cost_per_1k, output_cost_per_1k);

    // Extract metadata
    const providerId = parentRun.inputs?.providerId || parentRun.extra?.providerId || 'N/A';
    const startTime = parentRun.start_time ? new Date(parentRun.start_time).toISOString() : 'N/A';
    const endTime = parentRun.end_time ? new Date(parentRun.end_time).toISOString() : 'N/A';

    // Log metrics to console
    logMetricsToConsole(parentRunId, providerId, startTime, endTime, latency, tokens, cost);

    return {
      runId: parentRunId,
      latency,
      tokens,
      cost,
    };
  } catch (error) {
    console.error("[LangSmith Metrics] ✗ Error fetching metrics:", error.message);
    return null;
  }
}

/**
 * Calculate latency metrics from parent and child runs
 * @private
 */
function calculateLatency(parentRun, childRuns) {
  const latency = {
    workflow_ms: 0,
    per_node: [],
  };

  // Calculate workflow latency
  if (parentRun.start_time && parentRun.end_time) {
    const startTime = new Date(parentRun.start_time).getTime();
    const endTime = new Date(parentRun.end_time).getTime();
    latency.workflow_ms = endTime - startTime;
  }

  // Calculate per-node latency
  if (Array.isArray(childRuns)) {
    for (const run of childRuns) {
      if (run.start_time && run.end_time) {
        const startTime = new Date(run.start_time).getTime();
        const endTime = new Date(run.end_time).getTime();
        const nodeLatency = endTime - startTime;

        latency.per_node.push({
          name: run.name || 'unknown',
          run_type: run.run_type || 'unknown',
          latency_ms: nodeLatency,
        });
      }
    }
  }

  return latency;
}

/**
 * Calculate token usage from LLM runs
 * @private
 */
function calculateTokenUsage(childRuns) {
  const tokens = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  if (!Array.isArray(childRuns)) {
    return tokens;
  }

  // Filter LLM runs and aggregate token usage
  for (const run of childRuns) {
    if (run.run_type === 'llm') {
      const tokenUsage = run.outputs?.llm_output?.token_usage;
      
      if (tokenUsage) {
        tokens.prompt_tokens += tokenUsage.prompt_tokens || 0;
        tokens.completion_tokens += tokenUsage.completion_tokens || 0;
        tokens.total_tokens += tokenUsage.total_tokens || 0;
      }
    }
  }

  return tokens;
}

/**
 * Calculate estimated cost based on token usage
 * @private
 */
function calculateCost(tokens, input_cost_per_1k, output_cost_per_1k) {
  const promptCost = (tokens.prompt_tokens / 1000) * input_cost_per_1k;
  const completionCost = (tokens.completion_tokens / 1000) * output_cost_per_1k;
  const totalCost = promptCost + completionCost;

  return {
    estimated_cost_usd: parseFloat(totalCost.toFixed(6)),
  };
}

/**
 * Log metrics to console (simplified)
 * @private
 */
function logMetricsToConsole(runId, providerId, startTime, endTime, latency, tokens, cost) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Provider ID: ${providerId}`);
  console.log(`Start Time: ${startTime}`);
  console.log(`End Time: ${endTime}`);
  console.log(`Latency: ${latency.workflow_ms}ms (${(latency.workflow_ms / 1000).toFixed(2)}s)`);
  console.log(`Total Tokens: ${tokens.total_tokens}`);
  console.log(`Estimated Cost: $${cost.estimated_cost_usd.toFixed(6)} USD`);
  console.log(`${'='.repeat(70)}\n`);
}

