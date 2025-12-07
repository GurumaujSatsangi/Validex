import { supabase } from "../../supabaseClient.js";
import { searchBusinessWithAzure } from "../tools/mapsClient.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";

export async function runInfoEnrichment(provider) {
  // ===============================================
  // STEP 1: AZURE MAPS BUSINESS (POI) LOOKUP
  // ===============================================
  const poiData = await searchBusinessWithAzure(provider);
  let poiFound = false;

  if (poiData) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "AZURE_POI",
        raw_data: poiData
      });
      if (error) {
        console.error("Failed to insert AZURE_POI provider_sources for", provider.id, error.message || error);
      } else {
        poiFound = poiData.isFound === true;
      }
    } catch (err) {
      console.error("Unexpected error inserting AZURE_POI provider_sources", err);
    }
  }

  // ===============================================
  // STEP 2: WEB SCRAPING (run for all providers to collect richer info)
  // ===============================================
  let scrapedData = null;

  console.info("[Info Enrichment] Running web scraping for provider", provider.id);
  scrapedData = await scrapeProviderInfo(provider);

  if (scrapedData) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "SCRAPING_ENRICHMENT",
        raw_data: scrapedData
      });
      if (error) {
        console.error("Failed to insert SCRAPING_ENRICHMENT provider_sources for", provider.id, error.message || error);
      }
    } catch (err) {
      console.error("Unexpected error inserting SCRAPING_ENRICHMENT provider_sources", err);
    }
  }

  return { poiData, scrapedData };
}
