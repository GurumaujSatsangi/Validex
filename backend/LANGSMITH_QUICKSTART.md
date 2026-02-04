# LangSmith Tracing - Quick Start Guide

## 🚀 Get Started in 2 Minutes

### Step 1: Set Your API Key (Optional but Recommended)

```bash
# Edit .env in the backend directory
LANGSMITH_API_KEY=your_api_key_here
LANGSMITH_PROJECT=truelens-validation
```

Get your API key from: https://smith.langchain.com/

### Step 2: Run a Workflow

```javascript
import { executeValidationWorkflow } from "./services/graph/workflow.js";

const result = await executeValidationWorkflow({
  name: "Dr. John Smith",
  npi: "1234567890",
  address: "123 Medical Plaza",
  phone: "555-0123",
  website: "https://example.com",
  specialty: "Cardiology",
  state: "NY"
});

// See the execution trace
console.log(result.executionTrace);
```

### Step 3: View Results

You'll see output like:

```
[LangSmith] Executing node: data_validation
[LangSmith] Node 'data_validation' completed in 1250ms

[LangSmith] Workflow Execution Order Summary:
============================================================
1. data_validation (1250ms) - 2026-02-04T10:30:45.123Z
2. information_enrichment (2100ms) - 2026-02-04T10:30:46.500Z
3. quality_assurance (1800ms) - 2026-02-04T10:30:48.700Z
4. directory_management (530ms) - 2026-02-04T10:30:49.230Z
============================================================
```

## 📊 What You Get

### In Console
- ✓ Real-time node execution logs
- ✓ Execution order and timing
- ✓ Error tracking
- ✓ Workflow summary

### In Code (executionTrace)
```javascript
{
  workflowId: "wf_1707027045123_...",
  providerId: "provider_123",
  executionSummary: {
    totalNodes: 4,
    totalDuration: 5680,
    nodeSequence: "data_validation → information_enrichment → quality_assurance → directory_management"
  },
  detailedExecution: [
    {
      order: 1,
      nodeName: "data_validation",
      duration: 1250,
      durationFormatted: "1.25s",
      error: null
    },
    // ... more nodes
  ]
}
```

### In LangSmith Dashboard (when API key set)
- View all workflow executions
- Track node execution times
- Analyze performance trends
- Monitor errors and failures

## 🔍 Track Node Execution Order

The `nodeExecutionOrder` state field shows exactly which nodes executed and in what order:

```javascript
result.state.nodeExecutionOrder = [
  {
    nodeName: "data_validation",
    timestamp: "2026-02-04T10:30:45.123Z",
    duration_ms: 1250,
    order: 1
  },
  {
    nodeName: "information_enrichment",
    timestamp: "2026-02-04T10:30:46.500Z",
    duration_ms: 2100,
    order: 2
  },
  // ... more nodes
]
```

## 🧪 Try the Examples

Run all example scenarios:

```bash
node services/graph/LANGSMITH_EXAMPLES.js
```

Examples include:
1. Basic execution with trace
2. Streaming with real-time monitoring
3. Multiple executions comparison
4. Error handling and debugging
5. Configuration verification

## ⚙️ Configuration Options

### Environment Variables

```bash
# Required (but workflow works without it)
LANGSMITH_API_KEY=sk_live_xxxxx

# Optional
LANGSMITH_PROJECT=truelens-validation
```

### Workflow Options

```javascript
await executeValidationWorkflow(inputData, {
  providerId: "provider_123",      // Custom provider ID
  verbose: true,                   // Detailed console logs
  timeout: 60000                   // Timeout in milliseconds
});
```

## 📈 Monitor Performance

Check execution times for each node:

```javascript
const trace = result.executionTrace;
const slowest = trace.detailedExecution.reduce((prev, current) =>
  prev.duration > current.duration ? prev : current
);

console.log(`Slowest node: ${slowest.nodeName} (${slowest.durationFormatted})`);
```

## 🐛 Debugging

### Check if LangSmith is enabled

```javascript
import { initLangSmith } from "./services/graph/workflow.js";

const client = initLangSmith();
console.log(client ? "LangSmith enabled" : "LangSmith disabled");
```

### View detailed execution logs

```javascript
const result = await executeValidationWorkflow(inputData, {
  verbose: true  // Shows detailed step-by-step logs
});
```

### Check for errors

```javascript
if (!result.success) {
  console.error("Workflow failed:", result.error);
  console.error("Stack:", result.stack);
}

// Or check individual node errors in trace
result.executionTrace.detailedExecution.forEach(exec => {
  if (exec.error) {
    console.log(`${exec.nodeName} failed: ${exec.error}`);
  }
});
```

## 📚 Documentation

- **Full Integration Guide**: `LANGSMITH_INTEGRATION.md`
- **Implementation Details**: `LANGSMITH_IMPLEMENTATION_SUMMARY.md`
- **Code Examples**: `LANGSMITH_EXAMPLES.js`

## ✅ Verify It's Working

Run this test:

```javascript
import {
  executeValidationWorkflow,
  initLangSmith,
} from "./services/graph/workflow.js";

// Check LangSmith
const client = initLangSmith();
console.log("LangSmith:", client ? "✓ Enabled" : "✓ Disabled (local tracing)");

// Run workflow
const result = await executeValidationWorkflow({
  name: "Test",
  npi: "1234567890",
  address: "123 St",
  state: "CA"
});

// Check trace
if (result.executionTrace) {
  console.log("✓ Trace:", result.executionTrace.executionSummary.nodeSequence);
} else {
  console.log("✗ No trace returned");
}
```

## 🎯 Next Steps

1. **Set API Key** (optional): Get from smith.langchain.com
2. **Run Examples**: `node services/graph/LANGSMITH_EXAMPLES.js`
3. **Monitor Dashboard**: Check smith.langchain.com for traces
4. **Integrate with Your API**: Use `executeValidationWorkflow()` in routes
5. **Analyze Trends**: Use traces for performance optimization

## 💡 Tips

- Tracing has minimal performance impact (<5%)
- Local execution tracking works without API key
- All traces include error information
- Node execution order is always available
- Streaming allows real-time monitoring

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| No trace in result | Check if workflow completed successfully (`result.success`) |
| "LANGSMITH_API_KEY not set" | Set in .env, restart app (optional for local tracing) |
| Missing node in order | Check error logs in console |
| Slow execution | Use `verbose: true` to identify bottleneck |

## 📞 Support

- Check `LANGSMITH_INTEGRATION.md` for detailed documentation
- Review examples in `LANGSMITH_EXAMPLES.js`
- View LangSmith docs: https://docs.smith.langchain.com/
