import { supabase } from "../../supabaseClient.js";
import { normalizeAddressComponent, normalizeText } from "../tools/addressUtils.js";

/**
 * Normalize specialty text for comparison by:
 * - Converting to lowercase
 * - Removing punctuation and extra whitespace
 * - Sorting words alphabetically (handles "Certified Registered Nurse Anesthetist" vs "Nurse Anesthetist, Certified Registered")
 */
function normalizeSpecialty(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[,.-]/g, ' ')  // Replace punctuation with spaces
    .replace(/\s+/g, ' ')    // Normalize multiple spaces to single space
    .trim()
    .split(' ')
    .filter(word => word.length > 0)
    .sort()                  // Sort words alphabetically
    .join(' ');
}

/**
 * Normalize phone number for comparison by removing all non-digit characters
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export async function runQualityAssurance(provider, runId) {
  const { data: sources } = await supabase
    .from("provider_sources")
    .select("*")
    .eq("provider_id", provider.id);

  if (!sources || sources.length === 0) return { needsReview: false };

  const suggested = {};

  // Check NPI data
  const npiSource = sources.find(s => s.source_type === "NPI_API");
  if (npiSource && npiSource.raw_data && npiSource.raw_data.isFound) {
    const npiPhone = npiSource.raw_data.phone;
    if (npiPhone && normalizePhone(npiPhone) !== normalizePhone(provider.phone)) {
      suggested.phone = {
        oldValue: provider.phone,
        suggestedValue: npiPhone,
        confidence: 0.9,
        sourceType: "NPI_API"
      };
    }

    const npiSpec = npiSource.raw_data.speciality;
    if (npiSpec && normalizeSpecialty(npiSpec) !== normalizeSpecialty(provider.speciality)) {
      suggested.speciality = {
        oldValue: provider.speciality,
        suggestedValue: npiSpec,
        confidence: 0.85,
        sourceType: "NPI_API"
      };
    }
  }

  // Check Azure Maps address validation
  const azureSource = sources.find(s => s.source_type === "AZURE_MAPS");
  if (azureSource && azureSource.raw_data) {
    const azureData = azureSource.raw_data;

    // If address was not found (NO_RESULTS), create a low-confidence issue
    if (!azureData.isValid && azureData.reason === "NO_RESULTS") {
      suggested.address_line1 = {
        oldValue: provider.address_line1 || '',
        suggestedValue: "Address not found - please verify",
        confidence: 0.3,
        sourceType: "AZURE_MAPS"
      };
    }

    // If address was found, compare components
    if (azureData.isValid && azureData.formattedAddress) {
      // Compare ZIP code
      if (azureData.postalCode && provider.zip && azureData.postalCode !== provider.zip) {
        suggested.zip = {
          oldValue: provider.zip,
          suggestedValue: azureData.postalCode,
          confidence: 0.9,
          sourceType: "AZURE_MAPS"
        };
      }

      // Compare city (normalized)
      if (azureData.city && provider.city) {
        const normalizedAzureCity = normalizeAddressComponent(azureData.city);
        const normalizedProviderCity = normalizeAddressComponent(provider.city);
        
        if (normalizedAzureCity !== normalizedProviderCity) {
          suggested.city = {
            oldValue: provider.city,
            suggestedValue: azureData.city,
            confidence: 0.85,
            sourceType: "AZURE_MAPS"
          };
        }
      }

      // Compare state
      if (azureData.state && provider.state) {
        const normalizedAzureState = normalizeText(azureData.state);
        const normalizedProviderState = normalizeText(provider.state);
        
        if (normalizedAzureState !== normalizedProviderState) {
          suggested.state = {
            oldValue: provider.state,
            suggestedValue: azureData.state,
            confidence: 0.9,
            sourceType: "AZURE_MAPS"
          };
        }
      }

      // Use Azure Maps score to flag low-confidence matches
      if (azureData.score && azureData.score < 0.6) {
        suggested.address_line1 = {
          oldValue: provider.address_line1 || '',
          suggestedValue: azureData.formattedAddress.split(',')[0] || azureData.formattedAddress,
          confidence: 0.5,
          sourceType: "AZURE_MAPS"
        };
      }
    }
  }

  // Check Azure POI (business) data
  const poiSource = sources.find(s => s.source_type === "AZURE_POI");
  if (poiSource && poiSource.raw_data && poiSource.raw_data.isFound) {
    const poi = poiSource.raw_data;

    // Phone comparison
    if (poi.phone && normalizePhone(poi.phone) !== normalizePhone(provider.phone)) {
      suggested.phone = {
        oldValue: provider.phone || '',
        suggestedValue: poi.phone,
        confidence: 0.85,
        sourceType: "AZURE_POI"
      };
    }

    // Address comparisons
    if (poi.postalCode && provider.zip && poi.postalCode !== provider.zip) {
      suggested.zip = {
        oldValue: provider.zip,
        suggestedValue: poi.postalCode,
        confidence: 0.9,
        sourceType: "AZURE_POI"
      };
    }

    if (poi.city && provider.city) {
      const normalizedPoiCity = normalizeAddressComponent(poi.city);
      const normalizedProviderCity = normalizeAddressComponent(provider.city);
      if (normalizedPoiCity !== normalizedProviderCity) {
        suggested.city = {
          oldValue: provider.city,
          suggestedValue: poi.city,
          confidence: 0.85,
          sourceType: "AZURE_POI"
        };
      }
    }

    if (poi.state && provider.state) {
      const normalizedPoiState = normalizeText(poi.state);
      const normalizedProviderState = normalizeText(provider.state);
      if (normalizedPoiState !== normalizedProviderState) {
        suggested.state = {
          oldValue: provider.state,
          suggestedValue: poi.state,
          confidence: 0.9,
          sourceType: "AZURE_POI"
        };
      }
    }

    // Website enrichment (if provider has no website field, leave oldValue empty)
    if (poi.website) {
      suggested.website = {
        oldValue: provider.website || '',
        suggestedValue: poi.website,
        confidence: 0.8,
        sourceType: "AZURE_POI"
      };
    }

  }

  // Check scraping fallback data
  const scrapingSource = sources.find(s => s.source_type === "SCRAPING_FALLBACK");
  if (scrapingSource && scrapingSource.raw_data && scrapingSource.raw_data.isFound) {
    const scraped = scrapingSource.raw_data;

    // Phone comparison (only if not already suggested by other sources)
    if (scraped.phone && !suggested.phone && normalizePhone(scraped.phone) !== normalizePhone(provider.phone)) {
      suggested.phone = {
        oldValue: provider.phone || '',
        suggestedValue: scraped.phone,
        confidence: 0.7,
        sourceType: "SCRAPING_FALLBACK"
      };
    }

    // Website enrichment (only if not already suggested)
    if (scraped.website && !suggested.website) {
      suggested.website = {
        oldValue: provider.website || '',
        suggestedValue: scraped.website,
        confidence: 0.65,
        sourceType: "SCRAPING_FALLBACK"
      };
    }
  }

  // Prepare issue rows for bulk insert
  const issueRows = Object.entries(suggested).map(([fieldName, s]) => ({
    provider_id: provider.id,
    run_id: runId,
    field_name: fieldName,
    old_value: s.oldValue,
    suggested_value: s.suggestedValue,
    confidence: s.confidence,
    severity: s.confidence > 0.9 ? "HIGH" : s.confidence > 0.7 ? "MEDIUM" : "LOW",
    source_type: s.sourceType || "UNKNOWN",
    status: "OPEN"
  }));

  if (issueRows.length === 0) return { needsReview: false };

  try {
    const { data: inserted, error: insertErr } = await supabase.from("validation_issues").insert(issueRows);
    if (insertErr) {
      console.error("Failed to insert validation issues for provider", provider.id, insertErr.message || insertErr);
      // If insert failed, do not mark as needs review (keeps counts consistent)
      return { needsReview: false };
    }

    return { needsReview: inserted && inserted.length > 0 };
  } catch (err) {
    console.error("Unexpected error inserting validation issues", err);
    return { needsReview: false };
  }
}
