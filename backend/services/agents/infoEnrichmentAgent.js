import { supabase } from "../../supabaseClient.js";
import { searchBusinessWithAzure } from "../tools/mapsClient.js";

export async function runInfoEnrichment(provider) {
  const poiData = await searchBusinessWithAzure(provider);

  if (poiData && poiData.isFound) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "AZURE_POI",
        raw_data: poiData
      });
      if (error) {
        console.error("Failed to insert AZURE_POI provider_sources for", provider.id, error.message || error);
      }
    } catch (err) {
      console.error("Unexpected error inserting AZURE_POI provider_sources", err);
    }
  }

  return { poiData };
}
