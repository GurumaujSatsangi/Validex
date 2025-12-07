import axios from "axios";

const AZURE_MAPS_BASE_URL = "https://atlas.microsoft.com/search/address/json";
const AZURE_MAPS_FUZZY_BASE_URL = "https://atlas.microsoft.com/search/fuzzy/json";
const API_VERSION = "1.0";

/**
 * Validates and normalizes a provider's address using Azure Maps Search Address API
 * @param {Object} provider - Provider object with address fields
 * @returns {Promise<Object>} Validation result with isValid, formattedAddress, location, etc.
 */
export async function validateAddressWithAzure(provider) {
  const subscriptionKey = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

  if (!subscriptionKey) {
    console.warn("AZURE_MAPS_SUBSCRIPTION_KEY not set - skipping address validation");
    return {
      isValid: false,
      reason: "API_KEY_MISSING",
      formattedAddress: null,
      postalCode: null,
      city: null,
      state: null,
      location: null,
      score: null,
      raw: null
    };
  }

  // Build address string from provider fields
  const addressParts = [
    provider.address_line1,
    provider.city,
    provider.state,
    provider.zip
  ].filter(part => part && part.trim());

  if (addressParts.length === 0) {
    return {
      isValid: false,
      reason: "EMPTY_ADDRESS",
      formattedAddress: null,
      postalCode: null,
      city: null,
      state: null,
      location: null,
      score: null,
      raw: null
    };
  }

  const addressString = addressParts.join(", ");

  try {
    const response = await axios.get(AZURE_MAPS_BASE_URL, {
      params: {
        "api-version": API_VERSION,
        "subscription-key": subscriptionKey,
        query: addressString
      },
      timeout: 5000 // 5 second timeout
    });

    const results = response.data?.results;

    if (!results || results.length === 0) {
      return {
        isValid: false,
        reason: "NO_RESULTS",
        formattedAddress: null,
        postalCode: null,
        city: null,
        state: null,
        location: null,
        score: null,
        raw: response.data
      };
    }

    // Use the top result
    const result = results[0];

    return {
      isValid: true,
      reason: null,
      formattedAddress: result.address?.freeformAddress || null,
      postalCode: result.address?.postalCode || null,
      city: result.address?.municipality || null,
      state: result.address?.countrySubdivision || null,
      location: result.position
        ? { lat: result.position.lat, lon: result.position.lon }
        : null,
      score: result.score || null,
      raw: result
    };

  } catch (error) {
    console.error("Azure Maps API error for provider", provider.id, error.message);
    return {
      isValid: false,
      reason: "API_ERROR",
      formattedAddress: null,
      postalCode: null,
      city: null,
      state: null,
      location: null,
      score: null,
      raw: { error: error.message }
    };
  }
}

// Legacy function kept for backwards compatibility
export async function lookupAddress(address) {
  return null;
}

/**
 * Searches for a business/POI using Azure Maps Search Fuzzy API
 * @param {Object} provider - Provider object with name/city/state data
 * @returns {Promise<Object>} Normalized POI search result
 */
export async function searchBusinessWithAzure(provider) {
  const subscriptionKey = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;

  if (!subscriptionKey) {
    console.warn("AZURE_MAPS_SUBSCRIPTION_KEY not set - skipping POI search");
    return {
      isFound: false,
      name: null,
      formattedAddress: null,
      street: null,
      city: null,
      state: null,
      postalCode: null,
      phone: null,
      website: null,
      categories: null,
      location: null,
      score: 0,
      reason: "API_KEY_MISSING",
      raw: null
    };
  }

  const queryParts = [provider.name, provider.city, provider.state]
    .filter(Boolean)
    .map(part => part.trim())
    .filter(part => part.length > 0);

  if (queryParts.length === 0) {
    return {
      isFound: false,
      name: null,
      formattedAddress: null,
      street: null,
      city: null,
      state: null,
      postalCode: null,
      phone: null,
      website: null,
      categories: null,
      location: null,
      score: 0,
      reason: "EMPTY_QUERY",
      raw: null
    };
  }

  const queryString = queryParts.join(", ");

  console.info("[Azure POI] Searching", {
    providerId: provider.id,
    query: queryString
  });

  try {
    const response = await axios.get(AZURE_MAPS_FUZZY_BASE_URL, {
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

    const results = response.data?.results;

    if (!results || results.length === 0) {
      return {
        isFound: false,
        name: null,
        formattedAddress: null,
        street: null,
        city: null,
        state: null,
        postalCode: null,
        phone: null,
        website: null,
        categories: null,
        location: null,
        score: 0,
        reason: "NO_RESULTS",
        raw: response.data
      };
    }

    const result = results[0];
    const poi = result.poi || {};
    const addr = result.address || {};

    return {
      isFound: true,
      name: poi.name || null,
      formattedAddress: addr.freeformAddress || null,
      street: addr.streetName || null,
      city: addr.municipality || null,
      state: addr.countrySubdivision || null,
      postalCode: addr.postalCode || null,
      phone: poi.phone || null,
      website: poi.url || null,
      categories: poi.categories || poi.classifications?.map(c => c.names?.[0]?.name).filter(Boolean) || null,
      location: result.position ? { lat: result.position.lat, lon: result.position.lon } : null,
      score: result.score || null,
      reason: null,
      raw: result
    };

  } catch (error) {
    console.error("Azure Maps POI search error for provider", provider.id, error.message);
    return {
      isFound: false,
      name: null,
      formattedAddress: null,
      street: null,
      city: null,
      state: null,
      postalCode: null,
      phone: null,
      website: null,
      categories: null,
      location: null,
      score: 0,
      reason: "API_ERROR",
      raw: { error: error.message }
    };
  }
}
