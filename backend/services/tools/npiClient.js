import axios from "axios";

const NPI_REGISTRY_BASE_URL = "https://npiregistry.cms.hhs.gov/api/";
const API_VERSION = "2.1";

/**
 * Lookup NPI data by NPI ID (number)
 * @param {string} npiId - The NPI number to look up
 * @returns {Promise<Object|null>} NPI data or null if not found
 */
export async function getNpiDataByNpiId(npiId) {
  if (!npiId || typeof npiId !== 'string' || npiId.trim().length === 0) {
    return null;
  }

  try {
    const response = await axios.get(NPI_REGISTRY_BASE_URL, {
      params: {
        version: API_VERSION,
        number: npiId.trim(),
        limit: 1
      },
      timeout: 5000
    });

    const results = response.data?.results;
    if (!results || results.length === 0) {
      return {
        isFound: false,
        npi: npiId,
        name: null,
        phone: null,
        speciality: null,
        address: null,
        license: null,
        raw: null
      };
    }

    const entry = results[0];
    const basicInfo = entry.basic || {};
    const addresses = entry.addresses || [];
    const primaryAddr = addresses.find(a => a.address_purpose === "LOCATION") || addresses[0];
    const taxonomies = entry.taxonomies || [];
    const primaryTaxonomy = taxonomies[0] || {};

    return {
      isFound: true,
      npi: entry.number,
      name: basicInfo.first_name && basicInfo.last_name 
        ? `${basicInfo.first_name} ${basicInfo.last_name}`.trim()
        : basicInfo.organization_name || null,
      phone: primaryAddr?.telephone_number || null,
      speciality: primaryTaxonomy.desc || null,
      address: primaryAddr ? {
        address_1: primaryAddr.address_1,
        address_2: primaryAddr.address_2,
        city: primaryAddr.city,
        state: primaryAddr.state,
        postal_code: primaryAddr.postal_code,
        country_code: primaryAddr.country_code
      } : null,
      license: primaryTaxonomy.license || null,
      raw: entry
    };
  } catch (err) {
    console.error("NPI lookup by ID failed", npiId, err.message);
    return null;
  }
}

/**
 * Search NPI registry by provider name and optional location
 * @param {Object} provider - Provider object with name, city, state
 * @returns {Promise<Object|null>} NPI data or null if not found
 */
export async function searchNpiByName(provider) {
  try {
    const params = {
      version: API_VERSION,
      limit: 1
    };

    // Parse name - handle various formats
    const name = (provider.name || "").trim();
    if (!name) return null;

    const nameParts = name.split(/\s+/);
    
    // Try to detect organization vs individual
    // If name contains keywords like LLC, PC, DDS, DPM at end, treat as organization
    const orgKeywords = ['LLC', 'PC', 'INC', 'LTD', 'PLLC', 'PA'];
    const lastPart = nameParts[nameParts.length - 1]?.toUpperCase();
    const isOrganization = orgKeywords.some(kw => lastPart?.includes(kw)) || nameParts.length > 3;

    if (isOrganization) {
      params.organization_name = name;
    } else {
      // Assume first/last name format
      if (nameParts.length >= 2) {
        params.first_name = nameParts[0];
        params.last_name = nameParts.slice(1).join(" ");
      } else {
        params.last_name = name;
      }
    }

    if (provider.city) params.city = provider.city;
    if (provider.state) params.state = provider.state;

    const response = await axios.get(NPI_REGISTRY_BASE_URL, {
      params,
      timeout: 5000
    });

    const results = response.data?.results;
    if (!results || results.length === 0) {
      return {
        isFound: false,
        npi: null,
        name: null,
        phone: null,
        speciality: null,
        address: null,
        license: null,
        raw: null
      };
    }

    const entry = results[0];
    const basicInfo = entry.basic || {};
    const addresses = entry.addresses || [];
    const primaryAddr = addresses.find(a => a.address_purpose === "LOCATION") || addresses[0];
    const taxonomies = entry.taxonomies || [];
    const primaryTaxonomy = taxonomies[0] || {};

    return {
      isFound: true,
      npi: entry.number,
      name: basicInfo.first_name && basicInfo.last_name 
        ? `${basicInfo.first_name} ${basicInfo.last_name}`.trim()
        : basicInfo.organization_name || null,
      phone: primaryAddr?.telephone_number || null,
      speciality: primaryTaxonomy.desc || null,
      address: primaryAddr ? {
        address_1: primaryAddr.address_1,
        address_2: primaryAddr.address_2,
        city: primaryAddr.city,
        state: primaryAddr.state,
        postal_code: primaryAddr.postal_code,
        country_code: primaryAddr.country_code
      } : null,
      license: primaryTaxonomy.license || null,
      raw: entry
    };
  } catch (err) {
    console.error("NPI search by name failed for provider", provider.id, err.message);
    return null;
  }
}

/**
 * Legacy function - now routes to appropriate search method
 * @deprecated Use getNpiDataByNpiId or searchNpiByName directly
 */
export async function getNpiData(provider) {
  // If provider already has NPI, lookup by ID
  if (provider.npi_id) {
    return await getNpiDataByNpiId(provider.npi_id);
  }
  
  // Otherwise search by name
  return await searchNpiByName(provider);
}
