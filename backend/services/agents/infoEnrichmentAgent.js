import { supabase } from "../../supabaseClient.js";
import { searchBusinessWithAzure } from "../tools/mapsClient.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";
import { scrapeTrueLensWebsite } from "../tools/trueLensWebsiteScraper.js";
import { scrapeNPICertifications } from "../tools/npiCertificationsScraper.js";

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
  // STEP 2: TRUELENS WEBSITE SCRAPING
  // ===============================================
  console.info("[Info Enrichment] Scraping TrueLens website for", provider.name);
  const trueLensData = await scrapeTrueLensWebsite(provider.name);
  
  if (trueLensData && trueLensData.isFound) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "TRUELENS_WEBSITE",
        raw_data: trueLensData
      });
      if (error) {
        console.error("Failed to insert TRUELENS_WEBSITE source:", error.message);
      }
    } catch (err) {
      console.error("Error inserting TRUELENS_WEBSITE source:", err);
    }
  }

  // ===============================================
  // STEP 3: NPI CERTIFICATIONS SCRAPING
  // ===============================================
  if (provider.npi_id) {
    console.info("[Info Enrichment] Scraping NPI certifications for NPI:", provider.npi_id);
    const npiCertData = await scrapeNPICertifications(provider.npi_id, provider.name);
    
    if (npiCertData && npiCertData.isFound) {
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "NPI_CERTIFICATIONS",
          raw_data: npiCertData
        });
        if (error) {
          console.error("Failed to insert NPI_CERTIFICATIONS source:", error.message);
        }
      } catch (err) {
        console.error("Error inserting NPI_CERTIFICATIONS source:", err);
      }
    }
  }

  // ===============================================
  // STEP 4: WEB SCRAPING (run for all providers to collect richer info)
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

  // ===============================================
  // STEP 3: UPDATE PROVIDER EMAIL IF FOUND
  // ===============================================
  let providerEmail = null;

  // Try to get email from POI data
  if (poiData && poiData.email) {
    providerEmail = poiData.email;
  }

  // Try to get email from scraped data
  if (!providerEmail && scrapedData && scrapedData.email) {
    providerEmail = scrapedData.email;
  }

  // Update provider record with email if found and not already set
  if (providerEmail && !provider.email) {
    try {
      const { error: updateErr } = await supabase
        .from('providers')
        .update({ email: providerEmail })
        .eq('id', provider.id);

      if (updateErr) {
        console.error("[Info Enrichment] Failed to update provider email:", updateErr.message);
      } else {
        console.info("[Info Enrichment] Updated provider email:", providerEmail);
      }
    } catch (err) {
      console.error("[Info Enrichment] Error updating provider email:", err);
    }
  }

  return { poiData, scrapedData };
}
