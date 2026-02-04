/**
 * Test LangSmith Integration
 * Run with: node test-langsmith.js
 */

import { executeValidationWorkflow } from "./services/graph/workflow.js";

const testProvider = {
  name: "Dr. Jane Smith",
  npi: "1234567890",
  address: "123 Main St, San Francisco, CA 94102",
  phone: "555-123-4567",
  website: "https://example-doctor.com",
  specialty: "Internal Medicine",
  state: "CA",
};

console.log("Starting LangSmith trace test...\n");

try {
  const result = await executeValidationWorkflow(testProvider, {
    providerId: `test_${Date.now()}`,
    verbose: false,
    timeout: 60000,
  });

  console.log("\n✅ Workflow executed successfully!");
  console.log("Check LangSmith dashboard at: https://smith.langchain.com/");
  console.log("Project: EY_VALIDEX");
} catch (error) {
  console.error("❌ Error executing workflow:", error.message);
  process.exit(1);
}
