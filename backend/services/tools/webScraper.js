import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Attempts to scrape provider information from public sources as a fallback
 * when Azure Maps POI lookup fails - now including appointment timings and hospital affiliations
 * @param {Object} provider - Provider object with name, npi_id, city, state, phone, website, speciality, affiliations_json
 * @returns {Promise<Object>} Scraped data including appointments and affiliations or null if unsuccessful
 */
export async function scrapeProviderInfo(provider) {
  console.info("[Web Scraper] Starting web scraping for provider", provider.id);

  const scrapedData = {
    isFound: false,
    phone: null,
    address: null,
    website: null,
    email: null,
    categories: null,
    appointment_timings: [],
    hospital_affiliations: [],
    availability_status: null,
    sources: []
  };

  // ===============================================
  // SOURCE 1: Generic web search for provider using name + NPI
  // ===============================================
  const searchData = await scrapeGenericSearch(provider);
  if (searchData && searchData.isFound) {
    scrapedData.isFound = true;
    scrapedData.phone = scrapedData.phone || searchData.phone;
    scrapedData.address = scrapedData.address || searchData.address;
    scrapedData.website = scrapedData.website || searchData.website;
    scrapedData.email = scrapedData.email || searchData.email;
    scrapedData.categories = scrapedData.categories || searchData.categories;
    scrapedData.appointment_timings = searchData.appointment_timings || [];
    scrapedData.hospital_affiliations = searchData.hospital_affiliations || [];
    scrapedData.availability_status = searchData.availability_status || scrapedData.availability_status;
    scrapedData.sources.push(...(searchData.sources || []));
  }

  // If we found data, return it
  if (scrapedData.isFound) {
    console.info("[Web Scraper] Successfully scraped provider data - sources:", scrapedData.sources.join(', '));
    return scrapedData;
  }

  return scrapedData.sources.length > 0 ? scrapedData : { isFound: false, sources: [] };
}

/**
 * Performs comprehensive web scraping for provider information with appointment timings and hospital affiliations
 * Searches across multiple healthcare directories using provider name and NPI
 * @param {Object} provider - Provider object with name, npi_id, city, state
 * @returns {Promise<Object>} Scraped data including appointments and affiliations from multiple sources
 */
async function scrapeGenericSearch(provider) {
  console.info("[Web Scraper] Searching for provider using name and NPI:", provider.name, provider.npi_id);

  try {
    const scrapedData = {
      isFound: false,
      phone: null,
      address: null,
      website: null,
      email: null,
      categories: null,
      appointment_timings: [],
      hospital_affiliations: [],
      availability_status: null,
      sources: []
    };

    // Search across multiple provider directories
    const searchResults = await searchProviderOnline(provider);
    
    if (searchResults && searchResults.length > 0) {
      scrapedData.isFound = true;
      
      // Process each search result
      for (const result of searchResults) {
        console.info(`[Web Scraper] Processing result from ${result.source}`);
        
        // Extract basic information from search result
        scrapedData.phone = scrapedData.phone || result.phone;
        scrapedData.address = scrapedData.address || result.address;
        scrapedData.website = scrapedData.website || result.website;
        scrapedData.email = scrapedData.email || result.email;
        scrapedData.categories = scrapedData.categories || result.specialties;
        scrapedData.sources.push(result.source);
        
        // Scrape appointment timings from provider profile URL
        if (result.profileUrl) {
          try {
            const timings = await scrapeAppointmentTimings(result.profileUrl);
            if (timings && timings.length > 0) {
              // Merge timings, avoiding duplicates
              for (const timing of timings) {
                const isDuplicate = scrapedData.appointment_timings.some(existing => 
                  existing.day === timing.day && 
                  existing.time_slots.join(',') === timing.time_slots.join(',')
                );
                if (!isDuplicate) {
                  scrapedData.appointment_timings.push({
                    ...timing,
                    scraped_from: result.source
                  });
                }
              }
              
              if (!scrapedData.sources.includes(`${result.source}_APPOINTMENTS`)) {
                scrapedData.sources.push(`${result.source}_APPOINTMENTS`);
              }
            }
          } catch (err) {
            console.warn(`[Web Scraper] Could not scrape appointment timings from ${result.source}:`, err.message);
          }
        }
      }
      
      // Scrape hospital affiliations (aggregated from all sources)
      try {
        const affiliations = await scrapeHospitalAffiliations(provider);
        if (affiliations && affiliations.length > 0) {
          scrapedData.hospital_affiliations = affiliations;
          scrapedData.availability_status = "ACTIVE";
          if (!scrapedData.sources.includes('HOSPITAL_AFFILIATIONS')) {
            scrapedData.sources.push('HOSPITAL_AFFILIATIONS');
          }
        }
      } catch (err) {
        console.warn("[Web Scraper] Could not scrape hospital affiliations:", err.message);
      }
      
      // Determine overall availability status
      if (scrapedData.appointment_timings.length > 0) {
        const hasOpenSlots = scrapedData.appointment_timings.some(t => t.status === 'OPEN' || t.time_slots.length > 0);
        scrapedData.availability_status = hasOpenSlots ? 'ACCEPTING_APPOINTMENTS' : 'LIMITED_AVAILABILITY';
      }
      
      console.info(`[Web Scraper] Successfully scraped data from ${scrapedData.sources.length} sources`);
      console.info(`[Web Scraper] Found ${scrapedData.appointment_timings.length} appointment timing entries`);
      console.info(`[Web Scraper] Found ${scrapedData.hospital_affiliations.length} hospital affiliations`);
      
      return scrapedData;
    }

    console.info("[Web Scraper] No search results found");
    return scrapedData;
  } catch (err) {
    console.error("[Web Scraper] Generic search failed", err.message);
    return {
      isFound: false,
      phone: null,
      address: null,
      website: null,
      email: null,
      categories: null,
      appointment_timings: [],
      hospital_affiliations: [],
      availability_status: null,
      sources: []
    };
  }
}

/**
 * Searches for provider online across multiple healthcare directories using Cheerio web scraping
 * @param {Object} provider - Provider object
 * @returns {Promise<Array>} Array of search results
 */
async function searchProviderOnline(provider) {
  try {
    console.info("[Provider Search] Searching for:", provider.name, "NPI:", provider.npi_id);
    
    const results = [];
    
    // SOURCE 1: Healthgrades
    try {
      const healthgradesData = await scrapeHealthgrades(provider);
      if (healthgradesData) results.push(healthgradesData);
    } catch (err) {
      console.warn("[Provider Search] Healthgrades search failed:", err.message);
    }

    // SOURCE 2: Vitals
    try {
      const vitalsData = await scrapeVitals(provider);
      if (vitalsData) results.push(vitalsData);
    } catch (err) {
      console.warn("[Provider Search] Vitals search failed:", err.message);
    }

    // SOURCE 3: WebMD
    try {
      const webmdData = await scrapeWebMD(provider);
      if (webmdData) results.push(webmdData);
    } catch (err) {
      console.warn("[Provider Search] WebMD search failed:", err.message);
    }

    // SOURCE 4: Doximity
    try {
      const doximityData = await scrapeDoximity(provider);
      if (doximityData) results.push(doximityData);
    } catch (err) {
      console.warn("[Provider Search] Doximity search failed:", err.message);
    }

    return results.length > 0 ? results : null;
  } catch (err) {
    console.error("[Provider Search] Error:", err.message);
    return null;
  }
}

/**
 * Scrapes provider data from Healthgrades
 */
async function scrapeHealthgrades(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city} ${provider.state}`);
    const searchUrl = `https://www.healthgrades.com/search?what=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for provider profile link
    let profileUrl = null;
    $('a[href*="/physician/"]').first().each((i, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        profileUrl = href.startsWith('http') ? href : `https://www.healthgrades.com${href}`;
      }
    });

    if (profileUrl) {
      return {
        name: provider.name,
        npi: provider.npi_id,
        profileUrl,
        source: "HEALTHGRADES"
      };
    }

    return null;
  } catch (err) {
    console.warn("[Healthgrades] Scraping failed:", err.message);
    return null;
  }
}

/**
 * Scrapes provider data from Vitals
 */
async function scrapeVitals(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city} ${provider.state}`);
    const searchUrl = `https://www.vitals.com/search?q=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for provider profile
    let profileUrl = null;
    $('a[href*="/doctors/"]').first().each((i, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        profileUrl = href.startsWith('http') ? href : `https://www.vitals.com${href}`;
      }
    });

    if (profileUrl) {
      return {
        name: provider.name,
        npi: provider.npi_id,
        profileUrl,
        source: "VITALS"
      };
    }

    return null;
  } catch (err) {
    console.warn("[Vitals] Scraping failed:", err.message);
    return null;
  }
}

/**
 * Scrapes provider data from WebMD
 */
async function scrapeWebMD(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city} ${provider.state}`);
    const searchUrl = `https://doctor.webmd.com/results?pagenumber=1&terms=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for provider profile
    let profileUrl = null;
    $('a[href*="/doctor/"]').first().each((i, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        profileUrl = href.startsWith('http') ? href : `https://doctor.webmd.com${href}`;
      }
    });

    if (profileUrl) {
      return {
        name: provider.name,
        npi: provider.npi_id,
        profileUrl,
        source: "WEBMD"
      };
    }

    return null;
  } catch (err) {
    console.warn("[WebMD] Scraping failed:", err.message);
    return null;
  }
}

/**
 * Scrapes provider data from Doximity
 */
async function scrapeDoximity(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city} ${provider.state}`);
    const searchUrl = `https://www.doximity.com/pub/search?query=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for provider profile
    let profileUrl = null;
    $('a[href*="/pub/"]').first().each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('/pub/') && !href.includes('/search')) {
        profileUrl = href.startsWith('http') ? href : `https://www.doximity.com${href}`;
      }
    });

    if (profileUrl) {
      return {
        name: provider.name,
        npi: provider.npi_id,
        profileUrl,
        source: "DOXIMITY"
      };
    }

    return null;
  } catch (err) {
    console.warn("[Doximity] Scraping failed:", err.message);
    return null;
  }
}

/**
 * Scrapes appointment timings from a provider's profile page using Cheerio
 * @param {string} profileUrl - URL of provider profile
 * @returns {Promise<Array>} Array of appointment timing objects
 */
async function scrapeAppointmentTimings(profileUrl) {
  try {
    console.info("[Appointment Scraper] Scraping timings from:", profileUrl);
    
    const response = await axios.get(profileUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    const $ = cheerio.load(response.data);
    const timings = [];

    // PATTERN 1: Look for common appointment/office hours selectors
    const timingSelectors = [
      '.office-hours',
      '.practice-hours',
      '.appointment-times',
      '.availability-slots',
      '.hours-of-operation',
      '[class*="office-hours"]',
      '[class*="practice-hours"]',
      '[class*="appointment"]',
      '[class*="availability"]',
      '[class*="hours"]',
      '[data-test="office-hours"]',
      '[data-testid*="hours"]',
      '#office-hours',
      '#practice-hours',
      '[id*="hours"]'
    ];

    for (const selector of timingSelectors) {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 5 && text.length < 1000) {
          const timing = {
            day: extractDay(text),
            time_slots: extractTimeSlots(text),
            status: determineAvailability(text),
            raw_text: text.substring(0, 300),
            source: 'selector'
          };
          
          if (timing.day || timing.time_slots.length > 0 || timing.status) {
            timings.push(timing);
          }
        }
      });
    }

    // PATTERN 2: Look for structured table format (common in provider directories)
    $('table').each((tableIdx, table) => {
      const tableText = $(table).text().toLowerCase();
      if (tableText.includes('hour') || tableText.includes('day') || tableText.includes('appointment') || tableText.includes('availability')) {
        $(table).find('tr').each((rowIdx, row) => {
          const cells = $(row).find('td, th');
          if (cells.length >= 2) {
            const dayCell = $(cells[0]).text().trim();
            const timeCell = $(cells[1]).text().trim();
            
            if (dayCell && timeCell) {
              const isDayOfWeek = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(dayCell);
              const hasTimePattern = /\d{1,2}:\d{2}|am|pm|closed/i.test(timeCell);
              
              if (isDayOfWeek || hasTimePattern) {
                timings.push({
                  day: extractDay(dayCell) || dayCell,
                  time_slots: extractTimeSlots(timeCell),
                  status: determineAvailability(timeCell),
                  raw_text: `${dayCell}: ${timeCell}`,
                  source: 'table'
                });
              }
            }
          }
        });
      }
    });

    // PATTERN 3: Look for definition lists (dl/dt/dd) - common for structured data
    $('dl').each((dlIdx, dl) => {
      const dlText = $(dl).text().toLowerCase();
      if (dlText.includes('hour') || dlText.includes('day')) {
        let currentDay = null;
        $(dl).children().each((i, elem) => {
          if (elem.name === 'dt') {
            currentDay = $(elem).text().trim();
          } else if (elem.name === 'dd' && currentDay) {
            const timeText = $(elem).text().trim();
            timings.push({
              day: extractDay(currentDay) || currentDay,
              time_slots: extractTimeSlots(timeText),
              status: determineAvailability(timeText),
              raw_text: `${currentDay}: ${timeText}`,
              source: 'definition-list'
            });
            currentDay = null;
          }
        });
      }
    });

    // PATTERN 4: Look for list items with day/time patterns
    $('ul li, ol li').each((i, li) => {
      const text = $(li).text().trim();
      const isDayOfWeek = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(text);
      const hasTimePattern = /\d{1,2}:\d{2}/.test(text);
      
      if ((isDayOfWeek || hasTimePattern) && text.length < 200) {
        timings.push({
          day: extractDay(text),
          time_slots: extractTimeSlots(text),
          status: determineAvailability(text),
          raw_text: text,
          source: 'list'
        });
      }
    });

    // PATTERN 5: Look for divs with day/time content
    $('div').each((i, div) => {
      const text = $(div).text().trim();
      // Only process small divs that look like day/time entries
      if (text.length > 10 && text.length < 150) {
        const isDayOfWeek = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(text);
        const hasTimePattern = /\d{1,2}:\d{2}/.test(text);
        
        if (isDayOfWeek && hasTimePattern) {
          timings.push({
            day: extractDay(text),
            time_slots: extractTimeSlots(text),
            status: determineAvailability(text),
            raw_text: text,
            source: 'div'
          });
        }
      }
    });

    // Remove duplicates based on day + time_slots
    const uniqueTimings = [];
    const seen = new Set();
    
    for (const timing of timings) {
      const key = `${timing.day}-${timing.time_slots.join(',')}-${timing.status}`;
      if (!seen.has(key) && (timing.day || timing.time_slots.length > 0)) {
        seen.add(key);
        uniqueTimings.push(timing);
      }
    }

    console.info(`[Appointment Scraper] Found ${uniqueTimings.length} appointment timing entries`);
    return uniqueTimings;
  } catch (err) {
    console.warn("[Appointment Scraper] Error scraping timings:", err.message);
    return [];
  }
}

/**
 * Scrapes hospital affiliations from multiple healthcare directory sources
 * @param {Object} provider - Provider object with name, npi_id
 * @returns {Promise<Array>} Array of hospital affiliation objects
 */
async function scrapeHospitalAffiliations(provider) {
  try {
    console.info("[Hospital Affiliations] Scraping affiliations for:", provider.name, "NPI:", provider.npi_id);
    
    const affiliations = [];

    // SOURCE 1: Try Healthgrades hospital affiliations
    try {
      const healthgradesAffiliations = await scrapeHealthgradesAffiliations(provider);
      if (healthgradesAffiliations && healthgradesAffiliations.length > 0) {
        affiliations.push(...healthgradesAffiliations);
      }
    } catch (err) {
      console.warn("[Hospital Affiliations] Healthgrades scraping failed:", err.message);
    }

    // SOURCE 2: Try Vitals hospital affiliations
    try {
      const vitalsAffiliations = await scrapeVitalsAffiliations(provider);
      if (vitalsAffiliations && vitalsAffiliations.length > 0) {
        affiliations.push(...vitalsAffiliations);
      }
    } catch (err) {
      console.warn("[Hospital Affiliations] Vitals scraping failed:", err.message);
    }

    // SOURCE 3: Try WebMD hospital affiliations
    try {
      const webmdAffiliations = await scrapeWebMDAffiliations(provider);
      if (webmdAffiliations && webmdAffiliations.length > 0) {
        affiliations.push(...webmdAffiliations);
      }
    } catch (err) {
      console.warn("[Hospital Affiliations] WebMD scraping failed:", err.message);
    }

    // SOURCE 4: Check if provider has existing affiliations data
    if (provider.affiliations_json) {
      try {
        const parsedAffiliations = typeof provider.affiliations_json === 'string' 
          ? JSON.parse(provider.affiliations_json)
          : provider.affiliations_json;
        
        if (Array.isArray(parsedAffiliations)) {
          parsedAffiliations.forEach(aff => {
            affiliations.push({
              name: aff.name || aff.hospital_name || 'Unknown Hospital',
              location: aff.location || aff.city || null,
              department: aff.department || null,
              role: aff.role || 'Physician',
              status: aff.status || 'ACTIVE',
              type: aff.type || 'HOSPITAL',
              source: 'EXISTING_DATA'
            });
          });
        }
      } catch (err) {
        console.warn("[Hospital Affiliations] Could not parse affiliations_json:", err.message);
      }
    }

    // Remove duplicates based on hospital name
    const uniqueAffiliations = [];
    const seenNames = new Set();
    
    for (const aff of affiliations) {
      const normalizedName = aff.name.toLowerCase().trim();
      if (!seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueAffiliations.push(aff);
      }
    }

    console.info(`[Hospital Affiliations] Found ${uniqueAffiliations.length} hospital affiliations`);
    return uniqueAffiliations;
  } catch (err) {
    console.warn("[Hospital Affiliations] Error scraping affiliations:", err.message);
    return [];
  }
}

/**
 * Scrapes hospital affiliations from Healthgrades provider profile
 */
async function scrapeHealthgradesAffiliations(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city || ''} ${provider.state || ''}`);
    const searchUrl = `https://www.healthgrades.com/search?what=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const affiliations = [];

    // Look for hospital affiliation sections
    const affiliationSelectors = [
      '.hospital-affiliations',
      '[class*="hospital"]',
      '[class*="affiliation"]',
      '[data-test="hospital"]',
      '.practice-locations'
    ];

    for (const selector of affiliationSelectors) {
      $(selector).each((i, elem) => {
        const text = $(elem).text().trim();
        const hospitalName = extractHospitalName(text);
        
        if (hospitalName) {
          affiliations.push({
            name: hospitalName,
            location: extractLocation(text) || `${provider.city}, ${provider.state}`,
            department: null,
            role: 'Physician',
            status: 'ACTIVE',
            type: 'HOSPITAL',
            source: 'HEALTHGRADES'
          });
        }
      });
    }

    // Look for hospitals in list items
    $('li').each((i, li) => {
      const text = $(li).text().trim();
      if (text.toLowerCase().includes('hospital') || text.toLowerCase().includes('medical center')) {
        const hospitalName = extractHospitalName(text);
        if (hospitalName && hospitalName.length > 5) {
          affiliations.push({
            name: hospitalName,
            location: extractLocation(text) || `${provider.city}, ${provider.state}`,
            department: null,
            role: 'Physician',
            status: 'ACTIVE',
            type: 'HOSPITAL',
            source: 'HEALTHGRADES'
          });
        }
      }
    });

    return affiliations;
  } catch (err) {
    console.warn("[Healthgrades Affiliations] Scraping failed:", err.message);
    return [];
  }
}

/**
 * Scrapes hospital affiliations from Vitals provider profile
 */
async function scrapeVitalsAffiliations(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city || ''} ${provider.state || ''}`);
    const searchUrl = `https://www.vitals.com/search?q=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const affiliations = [];

    // Look for hospital sections
    $('[class*="hospital"], [class*="affiliation"], [class*="facility"]').each((i, elem) => {
      const text = $(elem).text().trim();
      const hospitalName = extractHospitalName(text);
      
      if (hospitalName) {
        affiliations.push({
          name: hospitalName,
          location: extractLocation(text) || `${provider.city}, ${provider.state}`,
          department: null,
          role: 'Physician',
          status: 'ACTIVE',
          type: 'HOSPITAL',
          source: 'VITALS'
        });
      }
    });

    return affiliations;
  } catch (err) {
    console.warn("[Vitals Affiliations] Scraping failed:", err.message);
    return [];
  }
}

/**
 * Scrapes hospital affiliations from WebMD provider profile
 */
async function scrapeWebMDAffiliations(provider) {
  try {
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city || ''} ${provider.state || ''}`);
    const searchUrl = `https://doctor.webmd.com/results?pagenumber=1&terms=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const affiliations = [];

    // Look for hospital information
    $('[class*="hospital"], [class*="facility"], [class*="location"]').each((i, elem) => {
      const text = $(elem).text().trim();
      const hospitalName = extractHospitalName(text);
      
      if (hospitalName) {
        affiliations.push({
          name: hospitalName,
          location: extractLocation(text) || `${provider.city}, ${provider.state}`,
          department: null,
          role: 'Physician',
          status: 'ACTIVE',
          type: 'HOSPITAL',
          source: 'WEBMD'
        });
      }
    });

    return affiliations;
  } catch (err) {
    console.warn("[WebMD Affiliations] Scraping failed:", err.message);
    return [];
  }
}

/**
 * Extracts hospital name from text
 */
function extractHospitalName(text) {
  if (!text) return null;
  
  // Common patterns for hospital names
  const patterns = [
    /([A-Z][a-zA-Z\s&'-]+(?:Hospital|Medical Center|Health System|Clinic|Healthcare|Medical Group))/,
    /([A-Z][a-zA-Z\s&'-]{5,}(?:Hospital|Medical|Clinic|Health))/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If text contains hospital/medical but no pattern match, return cleaned text
  if ((text.toLowerCase().includes('hospital') || text.toLowerCase().includes('medical center')) && text.length < 100) {
    return text.trim();
  }
  
  return null;
}

/**
 * Extracts location (city, state) from text
 */
function extractLocation(text) {
  if (!text) return null;
  
  // Look for city, state pattern
  const locationPattern = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})/;
  const match = text.match(locationPattern);
  
  if (match && match[1] && match[2]) {
    return `${match[1]}, ${match[2]}`;
  }
  
  return null;
}

/**
 * Extracts day from timing text
 * @param {string} text - Timing text
 * @returns {string|null} Day name or null
 */
function extractDay(text) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    if (text.toLowerCase().includes(day.toLowerCase())) {
      return day;
    }
  }
  return null;
}

/**
 * Extracts time slots from text
 * @param {string} text - Timing text
 * @returns {Array} Array of time slot strings
 */
function extractTimeSlots(text) {
  const timePattern = /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/g;
  const matches = [];
  let match;
  
  while ((match = timePattern.exec(text)) !== null) {
    matches.push(match[0]);
  }
  
  return matches;
}

/**
 * Determines availability status from text
 * @param {string} text - Text to analyze
 * @returns {string} Status: 'OPEN', 'CLOSED', 'BY_APPOINTMENT', etc.
 */
function determineAvailability(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('closed')) return 'CLOSED';
  if (lowerText.includes('by appointment')) return 'BY_APPOINTMENT';
  if (lowerText.includes('appointment only')) return 'BY_APPOINTMENT';
  if (lowerText.includes('open')) return 'OPEN';
  if (/\d{1,2}:\d{2}/.test(text)) return 'OPEN';
  
  return null;
}

/**
 * Utility function to clean and normalize scraped phone numbers
 * @param {string} phone - Raw phone text
 * @returns {string|null} Normalized phone or null
 */
function normalizeScrapedPhone(phone) {
  if (!phone) return null;
  
  // Extract digits only
  const digits = phone.replace(/\D/g, '');
  
  // Must be 10 or 11 digits (with country code)
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  return phone; // Return as-is if format unclear
}
