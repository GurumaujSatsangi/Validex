import axios from "axios";
import { normalizeProviderNameForSearch } from "./nameNormalization.js";

const AZURE_MAPS_ADDRESS_URL = "https://atlas.microsoft.com/search/address/json";
const AZURE_MAPS_FUZZY_URL = "https://atlas.microsoft.com/search/fuzzy/json";
const API_VERSION = "1.0";

const MIN_POI_SCORE = 0.65;

/**
 * Validate and normalize a provider address using Azure Address Search
 */
export async function validateAddressWithAzure(provider) {
  const subscriptionKey = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

  if (!subscriptionKey) {
    return { isValid: false, reason: "API_KEY_MISSING" };
  }

  const addressParts = [
    provider.address_line1,
    provider.city,
    provider.state,
    provider.zip
  ].filter(Boolean);

  if (addressParts.length === 0) {
    return { isValid: false, reason: "EMPTY_ADDRESS" };
  }

  try {
    const response = await axios.get(AZURE_MAPS_ADDRESS_URL, {
      params: {
        "api-version": API_VERSION,
        "subscription-key": subscriptionKey,
        query: addressParts.join(", ")
      },
      timeout: 5000
    });

    const result = response.data?.results?.[0];
    if (!result) {
      return { isValid: false, reason: "NO_RESULTS" };
    }

    return {
      isValid: true,
      formattedAddress: result.address?.freeformAddress || null,
      address: {
        street: result.address?.streetName || null,
        city: result.address?.municipality || null,
        state: result.address?.countrySubdivision || null,
        postalCode: result.address?.postalCode || null
      },
      location: result.position
        ? { lat: result.position.lat, lon: result.position.lon }
        : null,
      score: result.score || null,
      raw: result
    };

  } catch (err) {
    return { isValid: false, reason: "API_ERROR", error: err.message };
  }
}

/**
 * Search for provider business / POI using Azure Fuzzy Search
 */
export async function searchBusinessWithAzure(provider) {
  const subscriptionKey = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

  if (!subscriptionKey) {
    console.warn("[Azure POI] API key missing");
    return { isFound: false, reason: "API_KEY_MISSING" };
  }

  // Normalize provider name for better search results
  const normalizedName = normalizeProviderNameForSearch(provider.name);

  // 🔧 Stronger query: name + full address when available
  const queryParts = [
    normalizedName,
    provider.address || provider.address_line1,
    provider.city,
    provider.state,
    provider.zip
  ].filter(Boolean);

  if (queryParts.length === 0) {
    console.warn("[Azure POI] Empty query (no data provided)");
    return { isFound: false, reason: "EMPTY_QUERY" };
  }

  const queryString = queryParts.join(", ");

  console.info("\n[Azure POI] ========== Starting Azure Search ==========");
  console.info("[Azure POI] Provider ID:", provider.id);
  console.info("[Azure POI] Original Name:", provider.name);
  console.info("[Azure POI] Normalized Name:", normalizedName);
  console.info("[Azure POI] Query String:", queryString);

  try {
    const response = await axios.get(AZURE_MAPS_FUZZY_URL, {
      params: {
        "api-version": API_VERSION,
        "subscription-key": subscriptionKey,
        query: queryString,
        limit: 3,
        countrySet: "US",
        typeahead: false
      },
      timeout: 5000
    });

    console.info("[Azure POI] API Response received");
    console.info("[Azure POI] Results count:", response.data?.results?.length || 0);

    const result = response.data?.results?.[0];
    if (!result) {
      console.warn("[Azure POI] ✗ No results returned from API");
      return {
        isFound: false,
        reason: "NO_RESULTS",
        raw: response.data
      };
    }

    const score = result.score || 0;
    console.info("[Azure POI] Top result score:", score);
    console.info("[Azure POI] Min required score:", MIN_POI_SCORE);

    if (score < MIN_POI_SCORE) {
      console.warn(`[Azure POI] ✗ Score (${score}) below threshold (${MIN_POI_SCORE})`);
      return {
        isFound: false,
        reason: "LOW_CONFIDENCE_OR_NO_RESULTS",
        score: score,
        raw: response.data
      };
    }

    const poi = result.poi || {};
    const addr = result.address || {};

    console.info("[Azure POI] ✓ Match found!");
    console.info("[Azure POI] POI Name:", poi.name || 'N/A');
    console.info("[Azure POI] Address:", addr.freeformAddress || 'N/A');
    console.info("[Azure POI] ========== Azure Search Complete ==========\n");

    return {
      isFound: true,
      score: score,
      name: poi.name || null,
      address: {
        street: addr.streetName || null,
        city: addr.municipality || null,
        state: addr.countrySubdivision || null,
        postalCode: addr.postalCode || null
      },
      formattedAddress: addr.freeformAddress || null,
      phone: poi.phone || null,
      website: poi.url || null,
      categories:
        poi.categories ||
        poi.classifications?.map(c => c.names?.[0]?.name).filter(Boolean) ||
        null,
      location: result.position
        ? { lat: result.position.lat, lon: result.position.lon }
        : null,
      raw: result
    };

  } catch (error) {
    console.error("[Azure POI] ✗ Error during search:", error.message);
    return {
      isFound: false,
      reason: "API_ERROR",
      raw: { error: error.message }
    };
  }
}
