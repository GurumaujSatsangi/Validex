import { runDataValidation } from "./agents/dataValidationAgent.js";
import { runQualityAssurance } from "./agents/qualityAssuranceAgent.js";
import { runDirectoryManagement } from "./agents/directoryManagementAgent.js";
import { runInfoEnrichment } from "./agents/infoEnrichmentAgent.js";

export async function runValidationForProvider(provider, runId) {
  await runDataValidation(provider);
  await runInfoEnrichment(provider);
  const qa = await runQualityAssurance(provider, runId);
  const dm = await runDirectoryManagement(provider, runId);
  return { needsReview: qa.needsReview || dm.needsReview };
}
