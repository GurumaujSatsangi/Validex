import axios from "axios";

const NPI_REGISTRY_BASE_URL = "https://npiregistry.cms.hhs.gov/api/";
const API_VERSION = "2.1";

/**
 * Normalize provider name for NPI search
 * Removes credentials, punctuation, and normalizes spacing
 * Examples:
 * - "KIERESTEN RANDERSON (RDHAP)" → "KIERESTEN RANDERSON"
 * - "KIERESTEN R ANDERSON, RDHAP" → "KIERESTEN R ANDERSON"
 * - "John  Doe, MD" → "JOHN DOE"
 * @param {string} name - Provider name to normalize
 * @returns {string} Normalized name
 */
function normalizeProviderName(name) {
  if (!name || typeof name !== 'string') return '';
  
  // Remove credentials in parentheses: (RDHAP), (RDH), etc.
  let normalized = name.replace(/\s*\([^)]+\)/g, '');
  
  // Remove credentials after comma: , RDHAP, , MD, , DDS, etc.
  normalized = normalized.replace(/\s*,\s*[A-Z]+\s*$/gi, '');
  normalized = normalized.replace(/\s*,\s+[A-Za-z]+$/g, '');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Convert to uppercase for consistency
  normalized = normalized.toUpperCase();
  
  // Remove common punctuation from within name
  normalized = normalized.replace(/[\.\-\']/g, '');
  
  return normalized;
}

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

    // Normalize name - remove credentials and punctuation
    const name = normalizeProviderName(provider.name);
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
 * Fetch complete provider data by NPI for database insertion
 * Returns normalized provider object ready for database
 * @param {string} npi - NPI number (10 digits)
 * @returns {Promise<Object|null>} Provider object or null if not found
 */
export async function fetchProviderByNpi(npi) {
  console.log(`[NPI Client] Fetching provider data for NPI: ${npi}`);

  // Validate NPI format
  if (!npi || typeof npi !== 'string') {
    throw new Error('Invalid NPI: must be a string');
  }

  const cleanNpi = npi.trim();
  
  if (!/^\d{10}$/.test(cleanNpi)) {
    throw new Error('Invalid NPI format: must be exactly 10 digits');
  }

  try {
    const response = await axios.get(NPI_REGISTRY_BASE_URL, {
      params: {
        version: API_VERSION,
        number: cleanNpi,
        limit: 1
      },
      timeout: 10000
    });

    const results = response.data?.results;
    if (!results || results.length === 0) {
      throw new Error(`No provider found with NPI: ${cleanNpi}`);
    }

    const entry = results[0];
    const basicInfo = entry.basic || {};
    const addresses = entry.addresses || [];
    const primaryAddr = addresses.find(a => a.address_purpose === "LOCATION") || addresses[0];
    const mailingAddr = addresses.find(a => a.address_purpose === "MAILING");
    const taxonomies = entry.taxonomies || [];
    const primaryTaxonomy = taxonomies.find(t => t.primary) || taxonomies[0] || {};

    // Determine provider name
    let providerName;
    if (basicInfo.first_name && basicInfo.last_name) {
      providerName = `${basicInfo.first_name} ${basicInfo.last_name}`.trim();
      if (basicInfo.middle_name) {
        providerName = `${basicInfo.first_name} ${basicInfo.middle_name} ${basicInfo.last_name}`.trim();
      }
    } else if (basicInfo.organization_name) {
      providerName = basicInfo.organization_name.trim();
    } else {
      providerName = 'Unknown Provider';
    }

    // Format phone number
    const phoneRaw = primaryAddr?.telephone_number;
    const phone = phoneRaw ? formatPhoneNumber(phoneRaw) : null;

    // Extract license information
    let licenseNumber = primaryTaxonomy.license || null;
    let licenseState = primaryTaxonomy.state || primaryAddr?.state || null;

    // Build provider object for database
    const providerData = {
      npi_id: cleanNpi,
      name: providerName,
      phone: phone,
      email: null, // NPI Registry doesn't provide email
      address_line1: primaryAddr?.address_1 || null,
      city: primaryAddr?.city || null,
      state: primaryAddr?.state || null,
      zip: primaryAddr?.postal_code || null,
      speciality: primaryTaxonomy.desc || 'General Practice',
      license_number: licenseNumber,
      license_state: licenseState,
      license_status: 'Active', // NPI Registry only shows active providers
      taxonomy_code: primaryTaxonomy.code || null,
      enumeration_date: entry.enumeration_date || null,
      last_updated: entry.last_updated || null,
      // Store full NPI response for reference
      npi_raw_data: entry
    };

    console.log(`[NPI Client] Successfully fetched provider: ${providerName} (${cleanNpi})`);
    
    return providerData;

  } catch (err) {
    if (err.message.includes('No provider found')) {
      throw err;
    }
    console.error(`[NPI Client] Failed to fetch NPI data for ${cleanNpi}:`, err.message);
    throw new Error(`Failed to fetch NPI data: ${err.message}`);
  }
}

/**
 * Format phone number to standard format
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Search NPI on external databases (npidb.org, providerwire.com) via web scraping
 * Called when standard NPI API search fails or returns no results
 * @param {Object} provider - Provider object with name, city, state
 * @returns {Promise<Object|null>} NPI data found or null if not found
 */
export async function searchNpiOnlineDatabase(provider) {
  try {
    const name = normalizeProviderName(provider.name);
    const city = (provider.city || "").trim();
    const state = (provider.state || "").trim();

    if (!name) return null;

    console.info("[NPI Client] Searching online NPI databases for:", name, city, state);

    // Try npidb.org first
    let result = await searchNpidbOrg(name, city, state);
    if (result) {
      console.info("[NPI Client] Found NPI on npidb.org:", result.npi);
      return result;
    }

    // Fallback to providerwire.com
    result = await searchProviderWire(name, city, state);
    if (result) {
      console.info("[NPI Client] Found NPI on providerwire.com:", result.npi);
      return result;
    }

    return null;
  } catch (err) {
    console.error("[NPI Client] Error searching online databases:", err.message);
    return null;
  }
}

/**
 * Search for NPI on npidb.org
 * @param {string} name - Provider name
 * @param {string} city - City
 * @param {string} state - State code
 * @returns {Promise<Object|null>} NPI data or null
 */
async function searchNpidbOrg(name, city, state) {
  try {
    const axios = (await import('axios')).default;
    const cheerio = (await import('cheerio')).default;

    const searchUrl = `https://npidb.org/npi/${encodeURIComponent(name)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    
    // Look for NPI number in page (typically in a results table or text)
    const npiMatches = response.data.match(/\b\d{10}\b/g);
    const phoneMatches = response.data.match(/\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g);
    
    if (npiMatches && npiMatches.length > 0) {
      return {
        isFound: true,
        npi: npiMatches[0],
        name: name,
        phone: phoneMatches ? phoneMatches[0] : null,
        speciality: null,
        address: null,
        license: null,
        source: "npidb.org"
      };
    }

    return null;
  } catch (err) {
    console.warn("[NPI Client] npidb.org search failed:", err.message);
    return null;
  }
}

/**
 * Search for NPI on providerwire.com
 * @param {string} name - Provider name
 * @param {string} city - City
 * @param {string} state - State code
 * @returns {Promise<Object|null>} NPI data or null
 */
async function searchProviderWire(name, city, state) {
  try {
    const axios = (await import('axios')).default;
    const cheerio = (await import('cheerio')).default;

    const searchUrl = `https://providerwire.com/search?name=${encodeURIComponent(name)}${state ? `&state=${state}` : ''}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    
    // Look for NPI number in page
    const npiMatches = response.data.match(/\b\d{10}\b/g);
    const phoneMatches = response.data.match(/\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g);
    
    if (npiMatches && npiMatches.length > 0) {
      return {
        isFound: true,
        npi: npiMatches[0],
        name: name,
        phone: phoneMatches ? phoneMatches[0] : null,
        speciality: null,
        address: null,
        license: null,
        source: "providerwire.com"
      };
    }

    return null;
  } catch (err) {
    console.warn("[NPI Client] providerwire.com search failed:", err.message);
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
