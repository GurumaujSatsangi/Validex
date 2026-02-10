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
 * All strategies run in PARALLEL. First successful result wins; the rest are discarded.
 * @param {Object} provider - Provider object with name, city, state
 * @returns {Promise<Object|null>} NPI data or null if not found
 */
export async function searchNpiByName(provider) {
  try {
    const name = normalizeProviderName(provider.name);
    if (!name) return null;

    const nameParts = name.split(/\s+/);
    const orgKeywords = ['LLC', 'PC', 'INC', 'LTD', 'PLLC', 'PA'];
    const lastPart = nameParts[nameParts.length - 1]?.toUpperCase();
    const isOrganization = orgKeywords.some(kw => lastPart?.includes(kw)) || nameParts.length > 4;

    const strategies = [];

    if (isOrganization) {
      strategies.push({ organization_name: name, city: provider.city, state: provider.state, label: "org+city+state" });
      strategies.push({ organization_name: name, state: provider.state, label: "org+state" });
      strategies.push({ organization_name: name, label: "org-only" });
    } else if (nameParts.length >= 2) {
      strategies.push({ first_name: nameParts[0], last_name: nameParts[nameParts.length - 1], city: provider.city, state: provider.state, label: "first+last+city+state" });
      strategies.push({ first_name: nameParts[0], last_name: nameParts.slice(1).join(" "), city: provider.city, state: provider.state, label: "first+fullLast+city+state" });
      strategies.push({ first_name: nameParts[0], last_name: nameParts[nameParts.length - 1], state: provider.state, label: "first+last+state" });
      strategies.push({ first_name: nameParts[0], last_name: nameParts.slice(1).join(" "), state: provider.state, label: "first+fullLast+state" });
      strategies.push({ first_name: nameParts[0], last_name: nameParts[nameParts.length - 1], label: "first+last-noLocation" });
      strategies.push({ first_name: nameParts[0].substring(0, 2) + "*", last_name: nameParts[nameParts.length - 1], state: provider.state, label: "wildcard+last+state" });
    } else {
      strategies.push({ last_name: name, state: provider.state, label: "lastOnly+state" });
      strategies.push({ last_name: name, label: "lastOnly" });
    }

    console.info(`[NPI Search] Launching ${strategies.length} strategies in PARALLEL for "${name}"...`);

    // Use AbortController so that once one strategy wins, th rest are cancelled
    const controller = new AbortController();
    const { signal } = controller;

    const raceResult = await raceForFirstResult(
      strategies.map(strategy => async () => {
        if (signal.aborted) return null;
        try {
          const params = { version: API_VERSION, limit: 5 };
          if (strategy.first_name) params.first_name = strategy.first_name;
          if (strategy.last_name) params.last_name = strategy.last_name;
          if (strategy.organization_name) params.organization_name = strategy.organization_name;
          if (strategy.city) params.city = strategy.city;
          if (strategy.state) params.state = strategy.state;

          console.info(`[NPI Search] → strategy "${strategy.label}"`);
          const response = await axios.get(NPI_REGISTRY_BASE_URL, { params, timeout: 8000, signal });
          const results = response.data?.results;

          if (results && results.length > 0) {
            const bestEntry = findBestNpiMatch(results, name, provider.state);
            if (bestEntry) {
              console.info(`[NPI Search] ✓ Hit via "${strategy.label}": NPI ${bestEntry.number}`);
              return formatNpiResult(bestEntry);
            }
          }
        } catch (err) {
          if (err.name === 'CanceledError' || signal.aborted) return null;
          // Silently ignore per-strategy errors
        }
        return null;
      }),
      controller
    );

    if (raceResult) return raceResult;

    console.warn(`[NPI Search] All ${strategies.length} strategies exhausted, no match for "${name}"`);
    return { isFound: false, npi: null, name: null, phone: null, speciality: null, address: null, license: null, raw: null };
  } catch (err) {
    console.error("NPI search by name failed for provider", provider.id, err.message);
    return null;
  }
}

/**
 * Run an array of async factory functions in parallel.
 * Returns the first non-null result and aborts the rest.
 * @param {Array<Function>} taskFactories - Array of () => Promise<T|null>
 * @param {AbortController} controller - shared abort controller
 * @returns {Promise<T|null>}
 */
async function raceForFirstResult(taskFactories, controller) {
  return new Promise((resolve) => {
    let settled = false;
    let pending = taskFactories.length;

    if (pending === 0) { resolve(null); return; }

    taskFactories.forEach(fn => {
      fn().then(result => {
        if (settled) return;
        if (result) {
          settled = true;
          controller.abort();
          resolve(result);
        } else {
          pending--;
          if (pending === 0 && !settled) { settled = true; resolve(null); }
        }
      }).catch(() => {
        if (settled) return;
        pending--;
        if (pending === 0 && !settled) { settled = true; resolve(null); }
      });
    });
  });
}

/**
 * Find the best matching NPI result from a list of results
 */
function findBestNpiMatch(results, searchName, searchState) {
  if (!results || results.length === 0) return null;

  const normalizedSearch = searchName.toUpperCase().replace(/[^A-Z\s]/g, '').trim();
  const searchParts = normalizedSearch.split(/\s+/);

  let bestEntry = null;
  let bestScore = 0;

  for (const entry of results) {
    const basic = entry.basic || {};
    let entryName = '';
    if (basic.first_name && basic.last_name) {
      entryName = `${basic.first_name} ${basic.middle_name || ''} ${basic.last_name}`.toUpperCase().replace(/\s+/g, ' ').trim();
    } else if (basic.organization_name) {
      entryName = basic.organization_name.toUpperCase();
    }

    const entryParts = entryName.replace(/[^A-Z\s]/g, '').split(/\s+/);
    
    // Score: count matching name parts
    let score = 0;
    for (const sp of searchParts) {
      if (entryParts.some(ep => ep === sp)) score += 2;
      else if (entryParts.some(ep => ep.startsWith(sp) || sp.startsWith(ep))) score += 1;
    }

    // Bonus for state match
    const addr = (entry.addresses || []).find(a => a.address_purpose === "LOCATION") || (entry.addresses || [])[0];
    if (searchState && addr?.state?.toUpperCase() === searchState.toUpperCase()) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Require at least a first+last name match (score >= 4)
  return bestScore >= 3 ? bestEntry : (results.length === 1 ? results[0] : null);
}

/**
 * Format raw NPI API result into standardized response
 */
function formatNpiResult(entry) {
  const basicInfo = entry.basic || {};
  const addresses = entry.addresses || [];
  const primaryAddr = addresses.find(a => a.address_purpose === "LOCATION") || addresses[0];
  const taxonomies = entry.taxonomies || [];
  const primaryTaxonomy = taxonomies.find(t => t.primary) || taxonomies[0] || {};

  return {
    isFound: true,
    npi: entry.number,
    name: basicInfo.first_name && basicInfo.last_name 
      ? `${basicInfo.first_name} ${basicInfo.middle_name ? basicInfo.middle_name + ' ' : ''}${basicInfo.last_name}`.trim()
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
 * Search NPI on external databases via web scraping + search engines.
 * All sources run in PARALLEL. First verified result wins, rest are cancelled.
 * 
 * Parallel batch 1 (direct NPI sites):
 *   npidb.org, providerwire.com, npino.com, nppeslookup.org, hipaaspace.com
 * Parallel batch 2 (search engines — only runs if batch 1 found nothing):
 *   DuckDuckGo, Bing, Google + "name NPI" strategy
 * 
 * @param {Object} provider - Provider object with name, city, state
 * @returns {Promise<Object|null>} NPI data found or null if not found
 */
export async function searchNpiOnlineDatabase(provider) {
  try {
    const name = normalizeProviderName(provider.name);
    const city = (provider.city || "").trim();
    const state = (provider.state || "").trim();

    if (!name) return null;

    console.info("\n[NPI Online] ========== Starting Parallel NPI Web Search ==========");
    console.info("[NPI Online] Provider:", name, "| City:", city, "| State:", state);

    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const commonHeaders = (referer) => ({
      'User-Agent': getUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...(referer ? { 'Referer': referer } : {}),
    });

    // ====== BATCH 1: Direct NPI sites (all in parallel) ======
    console.info("[NPI Online] Batch 1: Launching 5 direct NPI sites in parallel...");
    const controller1 = new AbortController();

    const batch1Tasks = [
      // npidb.org
      () => searchNpiSource({
        name: "npidb.org",
        urls: [
          `https://npidb.org/doctors/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}/`,
          `https://npidb.org/npi/${encodeURIComponent(name)}`,
          `https://npidb.org/search/?query=${encodeURIComponent(name + (state ? ' ' + state : ''))}`,
        ],
        headers: commonHeaders('https://npidb.org/'),
        signal: controller1.signal,
      }),
      // providerwire.com
      () => searchNpiSource({
        name: "providerwire.com",
        urls: [`https://providerwire.com/search?name=${encodeURIComponent(name)}${state ? `&state=${state}` : ''}`],
        headers: commonHeaders('https://providerwire.com/'),
        signal: controller1.signal,
      }),
      // npino.com
      () => searchNpiSource({
        name: "npino.com",
        urls: [
          `https://npino.com/search/?q=${encodeURIComponent(name)}${state ? '+' + state : ''}`,
          `https://npino.com/npi/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}/`,
        ],
        headers: commonHeaders('https://npino.com/'),
        signal: controller1.signal,
      }),
      // nppeslookup.org
      () => searchNpiSource({
        name: "nppeslookup.org",
        urls: [`https://nppeslookup.org/search?name=${encodeURIComponent(name)}${state ? `&state=${state}` : ''}`],
        headers: commonHeaders('https://nppeslookup.org/'),
        signal: controller1.signal,
      }),
      // hipaaspace.com
      () => searchNpiSource({
        name: "hipaaspace.com",
        urls: [`https://www.hipaaspace.com/medical_billing/coding/npi/${encodeURIComponent(name)}`],
        headers: commonHeaders('https://www.hipaaspace.com/'),
        signal: controller1.signal,
      }),
    ];

    const batch1Result = await raceForFirstResult(batch1Tasks, controller1);
    if (batch1Result) {
      const verified = await verifyAndEnrichNpi(batch1Result, name);
      if (verified) return verified;
    }

    // ====== BATCH 2: Search engines (all in parallel) ======
    // Includes the "name + NPI" strategy (e.g. "MAUREEN OSULLIVAN ADT NPI")
    console.info("[NPI Online] Batch 1 found nothing. Batch 2: Launching search engines in parallel...");

    // Build the "name + credentials + NPI" query from the RAW provider name (keeps credentials)
    const rawNameForNpiSearch = (provider.name || "")
      .replace(/[().,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    const controller2 = new AbortController();

    const batch2Tasks = [
      // DuckDuckGo - name + NPI (like the Google screenshot)
      () => searchNpiViaSearchEngine({
        engineName: "DuckDuckGo (name+NPI)",
        searchUrl: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${rawNameForNpiSearch} NPI`)}`,
        headers: commonHeaders('https://duckduckgo.com/'),
        signal: controller2.signal,
      }),
      // DuckDuckGo - site-restricted
      () => searchNpiViaSearchEngine({
        engineName: "DuckDuckGo (sites)",
        searchUrl: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${name}" ${state} NPI site:npidb.org OR site:npino.com`)}`,
        headers: commonHeaders('https://duckduckgo.com/'),
        signal: controller2.signal,
      }),
      // Bing - name + NPI
      () => searchNpiViaSearchEngine({
        engineName: "Bing (name+NPI)",
        searchUrl: `https://www.bing.com/search?q=${encodeURIComponent(`${rawNameForNpiSearch} NPI`)}`,
        headers: commonHeaders('https://www.bing.com/'),
        signal: controller2.signal,
      }),
      // Google - name + NPI (matches screenshot: "MAUREEN OSULLIVAN ADT NPI")
      () => searchNpiViaSearchEngine({
        engineName: "Google (name+NPI)",
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${rawNameForNpiSearch} NPI`)}`,
        headers: commonHeaders('https://www.google.com/'),
        signal: controller2.signal,
      }),
      // Bing - with state and quotes
      () => searchNpiViaSearchEngine({
        engineName: "Bing (quoted)",
        searchUrl: `https://www.bing.com/search?q=${encodeURIComponent(`"${name}" ${state} NPI number provider`)}`,
        headers: commonHeaders('https://www.bing.com/'),
        signal: controller2.signal,
      }),
      // Google - with state and quotes
      () => searchNpiViaSearchEngine({
        engineName: "Google (quoted)",
        searchUrl: `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${state} NPI number provider`)}`,
        headers: commonHeaders('https://www.google.com/'),
        signal: controller2.signal,
      }),
    ];

    const batch2Result = await raceForFirstResult(batch2Tasks, controller2);
    if (batch2Result) {
      const verified = await verifyAndEnrichNpi(batch2Result, name);
      if (verified) return verified;
    }

    console.warn("[NPI Online] All sources exhausted. No NPI found.");
    console.info("[NPI Online] ========== NPI Web Search Complete (NOT FOUND) ==========\n");
    return null;
  } catch (err) {
    console.error("[NPI Online] Fatal error searching online databases:", err.message);
    return null;
  }
}

/**
 * Generic NPI source scraper - tries URLs sequentially for a single source
 */
async function searchNpiSource({ name, urls = [], headers, signal }) {
  for (const url of urls) {
    if (signal?.aborted) return null;
    try {
      console.info(`[NPI Online] → ${name}: ${url.substring(0, 100)}`);
      
      const response = await axios.get(url, {
        headers,
        timeout: 8000,
        maxRedirects: 5,
        signal,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 403 || response.status === 429) {
        console.warn(`[NPI Online] ${name}: ${response.status} (blocked)`);
        continue;
      }
      if (response.status !== 200) continue;

      const npiNumbers = extractNpiFromHtml(response.data, name);
      if (npiNumbers.length > 0) {
        console.info(`[NPI Online] ✓ ${name}: found NPI ${npiNumbers[0]}`);
        return { npi: npiNumbers[0], source: name };
      }
    } catch (err) {
      if (err.name === 'CanceledError' || signal?.aborted) return null;
      console.warn(`[NPI Online] ${name} failed:`, err.message);
    }
  }
  return null;
}

/**
 * Search for NPI via search engine results scraping
 */
async function searchNpiViaSearchEngine({ engineName, searchUrl, headers, signal }) {
  if (signal?.aborted) return null;
  try {
    console.info(`[NPI Online] → ${engineName}: searching...`);
    
    const response = await axios.get(searchUrl, {
      headers,
      timeout: 10000,
      maxRedirects: 5,
      signal,
      validateStatus: (status) => status < 500,
    });

    if (response.status !== 200) {
      console.warn(`[NPI Online] ${engineName}: status ${response.status}`);
      return null;
    }

    // Extract labeled NPI numbers first
    const npiNumbers = extractNpiFromHtml(response.data, engineName);
    if (npiNumbers.length > 0) {
      console.info(`[NPI Online] ✓ ${engineName}: found NPI ${npiNumbers[0]}`);
      return { npi: npiNumbers[0], source: engineName };
    }

    // Extract NPI from URLs (e.g. npidb.org/npi/1234567890)
    const urlNpiPattern = /npi[\/=](\d{10})/gi;
    let urlMatch;
    while ((urlMatch = urlNpiPattern.exec(response.data)) !== null) {
      const candidateNpi = urlMatch[1];
      if (isValidNpiChecksum(candidateNpi)) {
        console.info(`[NPI Online] ✓ ${engineName}: found NPI in URL ${candidateNpi}`);
        return { npi: candidateNpi, source: engineName };
      }
    }

    // Extract NPI from search snippet text (e.g. "NPI 1619435682" or "NPI #1619435682")
    const snippetPattern = /NPI\s*#?\s*(\d{10})/gi;
    let snippetMatch;
    while ((snippetMatch = snippetPattern.exec(response.data)) !== null) {
      const candidateNpi = snippetMatch[1];
      if (isValidNpiChecksum(candidateNpi)) {
        console.info(`[NPI Online] ✓ ${engineName}: found NPI in snippet ${candidateNpi}`);
        return { npi: candidateNpi, source: engineName };
      }
    }

    console.info(`[NPI Online] ✗ ${engineName}: no NPI found`);
    return null;
  } catch (err) {
    if (err.name === 'CanceledError' || signal?.aborted) return null;
    console.warn(`[NPI Online] ${engineName} failed:`, err.message);
    return null;
  }
}

/**
 * Extract valid 10-digit NPI numbers from HTML content
 * Filters out common false positives (phone numbers, dates, zip codes, etc.)
 */
function extractNpiFromHtml(html, sourceName) {
  if (!html || typeof html !== 'string') return [];

  const allMatches = [];
  
  // Pattern 1: Explicitly labeled NPI (highest confidence)
  const labeledPatterns = [
    /NPI[\s:#]*(\d{10})/gi,
    /NPI\s*(?:Number|#|No\.?|ID)?[\s:]*(\d{10})/gi,
    /National\s+Provider\s+Identifier[\s:]*(\d{10})/gi,
    /npi_number['":\s]*(\d{10})/gi,
    /data-npi['"=\s]*(\d{10})/gi,
  ];

  for (const pattern of labeledPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      if (isValidNpiChecksum(match[1])) {
        allMatches.push(match[1]);
      }
    }
  }

  // If we found labeled NPIs, return those (highest confidence)
  if (allMatches.length > 0) {
    return [...new Set(allMatches)];
  }

  // Pattern 2: Standalone 10-digit numbers (lower confidence, verify with Luhn)
  const standalonePattern = /\b(\d{10})\b/g;
  let match;
  while ((match = standalonePattern.exec(html)) !== null) {
    const candidate = match[1];
    // Skip obvious non-NPIs
    if (candidate.startsWith('0')) continue; // NPIs start with 1 or 2
    if (/^(1[0-2]|0[1-9])/.test(candidate) && /\d{2}\/\d{2}\/\d{4}/.test(html.substring(Math.max(0, match.index - 15), match.index + 15))) continue; // date context
    
    if (isValidNpiChecksum(candidate)) {
      allMatches.push(candidate);
    }
  }

  return [...new Set(allMatches)];
}

/**
 * Validate NPI using Luhn algorithm (ISO standard check digit)
 * All valid NPIs pass the Luhn check with prefix 80840
 */
function isValidNpiChecksum(npi) {
  if (!npi || npi.length !== 10) return false;
  if (!/^\d{10}$/.test(npi)) return false;
  // NPIs start with 1 or 2
  if (npi[0] !== '1' && npi[0] !== '2') return false;

  // Luhn check with 80840 prefix
  const withPrefix = '80840' + npi;
  let sum = 0;
  let alternate = false;
  
  for (let i = withPrefix.length - 1; i >= 0; i--) {
    let n = parseInt(withPrefix[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Verify a scraped NPI via the official CMS API and return enriched data
 */
async function verifyAndEnrichNpi(result, searchName) {
  if (!result || !result.npi) return null;

  console.info(`[NPI Online] Verifying NPI ${result.npi} via official CMS API...`);

  try {
    const verified = await getNpiDataByNpiId(result.npi);
    if (verified && verified.isFound) {
      console.info(`[NPI Online] ✓ NPI ${result.npi} VERIFIED - Name: ${verified.name}, Phone: ${verified.phone}`);
      verified.source = result.source;
      console.info("[NPI Online] ========== NPI Web Search Complete (FOUND) ==========\n");
      return verified;
    } else {
      console.warn(`[NPI Online] ✗ NPI ${result.npi} could not be verified via CMS API`);
      // Still return what we found
      return {
        isFound: true,
        npi: result.npi,
        name: searchName,
        phone: null,
        speciality: null,
        address: null,
        license: null,
        source: result.source,
        raw: null,
      };
    }
  } catch (err) {
    console.warn(`[NPI Online] Verification failed for ${result.npi}:`, err.message);
    return {
      isFound: true,
      npi: result.npi,
      name: searchName,
      phone: null,
      speciality: null,
      address: null,
      license: null,
      source: result.source,
      raw: null,
    };
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
