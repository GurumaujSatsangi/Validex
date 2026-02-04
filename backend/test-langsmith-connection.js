/**
 * Quick LangSmith Connection Test
 * Tests if your new API key is working properly
 */

import dotenv from "dotenv";
import { Client as LangSmithClient } from "langsmith";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

async function testLangSmithConnection() {
  console.log("🧪 Testing LangSmith Connection...\n");
  
  const apiKey = process.env.LANGSMITH_API_KEY;
  const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
  const projectName = process.env.LANGSMITH_PROJECT || "validex_ey_2026";

  console.log("Configuration:");
  console.log("  API Key:", apiKey ? `${apiKey.substring(0, 20)}...` : "❌ NOT SET");
  console.log("  Endpoint:", endpoint);
  console.log("  Project:", projectName);
  console.log("");

  if (!apiKey) {
    console.error("❌ LANGSMITH_API_KEY is not set in .env file!");
    console.error("   Please add: LANGSMITH_API_KEY=your_new_key_here");
    process.exit(1);
  }

  try {
    console.log("Creating LangSmith client...");
    const client = new LangSmithClient({
      apiUrl: endpoint,
      apiKey: apiKey,
    });

    console.log("✓ Client created successfully\n");

    // Create a simple test run
    console.log("Creating test run on LangSmith...");
    const runId = uuidv4();
    
    const run = await client.createRun({
      id: runId,
      name: "langsmith_connection_test",
      run_type: "chain",
      inputs: {
        test: "connection_test",
        timestamp: new Date().toISOString()
      },
      project_name: projectName,
      tags: ["test", "connection_check"],
      start_time: Date.now(),
    });

    console.log("✓ Test run created successfully!");
    console.log(`  Run ID: ${runId}`);
    console.log("");

    // Update the run to complete it
    console.log("Completing test run...");
    await client.updateRun(runId, {
      end_time: Date.now(),
      outputs: {
        status: "success",
        message: "Connection test successful!"
      },
    });

    console.log("✓ Test run completed!\n");

    console.log("========================================");
    console.log("✅ SUCCESS! LangSmith is working!");
    console.log("========================================");
    console.log("");
    console.log("📊 View your runs at:");
    console.log(`   https://smith.langchain.com/`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Check your LangSmith dashboard");
    console.log("  2. Look for the project: ${projectName}");
    console.log("  3. You should see the test run: 'langsmith_connection_test'");
    console.log("  4. Run a validation workflow to see real traces!");
    console.log("");

  } catch (error) {
    console.error("\n❌ ERROR: LangSmith connection failed!");
    console.error("");
    console.error("Error details:");
    console.error("  Message:", error.message);
    console.error("  Type:", error.name);
    console.error("");
    
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      console.error("🔑 This looks like an authentication error.");
      console.error("   Please check:");
      console.error("   1. Your API key is correct");
      console.error("   2. The API key hasn't been deleted or expired");
      console.error("   3. You're using the correct endpoint");
    } else if (error.message.includes("404")) {
      console.error("🔍 This looks like a project not found error.");
      console.error("   Please check:");
      console.error("   1. The project name is correct: ${projectName}");
      console.error("   2. The project exists in your LangSmith workspace");
    } else if (error.message.includes("network") || error.message.includes("ENOTFOUND")) {
      console.error("🌐 This looks like a network connectivity error.");
      console.error("   Please check your internet connection.");
    }
    
    console.error("");
    process.exit(1);
  }
}

// Run the test
testLangSmithConnection();
