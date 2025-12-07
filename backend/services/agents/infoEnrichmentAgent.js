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
  // STEP 2: FALLBACK WEB SCRAPING (if Azure POI failed)
  // ===============================================
  let scrapedData = null;

  if (!poiFound) {
    console.info("[Info Enrichment] Azure POI not found for provider", provider.id, "- attempting web scraping fallback");
    
    scrapedData = await scrapeProviderInfo(provider);

    if (scrapedData && scrapedData.isFound) {
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "SCRAPING_FALLBACK",
          raw_data: scrapedData
        });
        if (error) {
          console.error("Failed to insert SCRAPING_FALLBACK provider_sources for", provider.id, error.message || error);
        }
      } catch (err) {
        console.error("Unexpected error inserting SCRAPING_FALLBACK provider_sources", err);
      }
    } else {
      // Insert not-found record for scraping attempt
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "SCRAPING_FALLBACK",
          raw_data: { isFound: false, sources: [] }
        });
        if (error) {
          console.error("Failed to insert SCRAPING_FALLBACK not-found for", provider.id, error.message || error);
        }
      } catch (err) {
        console.error("Unexpected error inserting SCRAPING_FALLBACK not-found", err);
      }
    }
  }

  return { poiData, scrapedData };
}
