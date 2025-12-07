import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Attempts to scrape provider information from public sources as a fallback
 * when Azure Maps POI lookup fails
 * @param {Object} provider - Provider object with name, npi_id, city, state
 * @returns {Promise<Object>} Scraped data or null if unsuccessful
 */
export async function scrapeProviderInfo(provider) {
  console.info("[Web Scraper] Starting fallback scraping for provider", provider.id);

  const scrapedData = {
    isFound: false,
    phone: null,
    address: null,
    website: null,
    categories: null,
    sources: []
  };

  // ===============================================
  // SOURCE 1: NPI Registry Profile Page
  // ===============================================
  if (provider.npi_id) {
    try {
      const npiProfileData = await scrapeNpiRegistryProfile(provider.npi_id);
      if (npiProfileData) {
        scrapedData.isFound = true;
        scrapedData.phone = scrapedData.phone || npiProfileData.phone;
        scrapedData.address = scrapedData.address || npiProfileData.address;
        scrapedData.website = scrapedData.website || npiProfileData.website;
        scrapedData.sources.push("NPI_REGISTRY_HTML");
      }
    } catch (err) {
      console.error("[Web Scraper] NPI Registry scraping failed", err.message);
    }
  }

  // ===============================================
  // SOURCE 2: Generic web search simulation
  // (In production, you'd integrate with search APIs or specific directories)
  // ===============================================
  try {
    const searchData = await scrapeGenericSearch(provider);
    if (searchData && searchData.isFound) {
      scrapedData.isFound = true;
      scrapedData.phone = scrapedData.phone || searchData.phone;
      scrapedData.address = scrapedData.address || searchData.address;
      scrapedData.website = scrapedData.website || searchData.website;
      scrapedData.categories = scrapedData.categories || searchData.categories;
      scrapedData.sources.push(...searchData.sources);
    }
  } catch (err) {
    console.error("[Web Scraper] Generic search scraping failed", err.message);
  }

  return scrapedData.isFound ? scrapedData : { isFound: false, sources: [] };
}

/**
 * Scrapes NPI Registry HTML profile page for a given NPI
 * @param {string} npiId - The NPI number
 * @returns {Promise<Object|null>} Scraped profile data or null
 */
async function scrapeNpiRegistryProfile(npiId) {
  // Note: NPI Registry doesn't have a direct HTML profile page with additional info
  // beyond what the API provides. This is a placeholder for demonstration.
  // In a real scenario, you might scrape provider directories, hospital listings, etc.
  
  try {
    // Example: If there were an HTML profile at a URL like this
    const url = `https://npiregistry.cms.hhs.gov/provider/${npiId}`;
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'TrueLens Healthcare Validation System'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Example selectors (these would need to match actual HTML structure)
    const phone = $('span.phone-number').text().trim() || null;
    const address = $('div.practice-address').text().trim() || null;
    const website = $('a.website-link').attr('href') || null;

    if (phone || address || website) {
      return { phone, address, website };
    }

    return null;
  } catch (err) {
    // NPI Registry doesn't actually have HTML profiles, so this will typically fail
    // This is intentional - it's a fallback mechanism
    return null;
  }
}

/**
 * Performs generic web scraping for provider information
 * This is a placeholder for more sophisticated scraping strategies
 * @param {Object} provider - Provider object
 * @returns {Promise<Object>} Scraped data
 */
async function scrapeGenericSearch(provider) {
  // In a production system, you might:
  // 1. Use a search API (Google Custom Search, Bing, etc.)
  // 2. Target specific healthcare directories (Healthgrades, Vitals, Zocdoc)
  // 3. Scrape hospital/practice websites
  // 4. Use business listing sites (Yelp, Yellow Pages)

  // For this implementation, we'll return a placeholder structure
  // Real implementation would make HTTP requests and parse HTML

  try {
    // Example: If scraping a healthcare directory
    const searchQuery = encodeURIComponent(`${provider.name} ${provider.city} ${provider.state} healthcare`);
    
    // Placeholder - in reality, you'd make actual HTTP requests
    // const searchUrl = `https://example-directory.com/search?q=${searchQuery}`;
    // const response = await axios.get(searchUrl, { timeout: 5000 });
    // const $ = cheerio.load(response.data);
    
    // For now, return not found since we don't have real endpoints to scrape
    return {
      isFound: false,
      phone: null,
      address: null,
      website: null,
      categories: null,
      sources: []
    };

    // Real implementation example:
    // const phone = $('.listing-phone').first().text().trim();
    // const address = $('.listing-address').first().text().trim();
    // const website = $('.listing-website').first().attr('href');
    // 
    // if (phone || address || website) {
    //   return {
    //     isFound: true,
    //     phone,
    //     address,
    //     website,
    //     categories: $('.listing-specialty').map((i, el) => $(el).text()).get(),
    //     sources: ['HEALTHCARE_DIRECTORY']
    //   };
    // }

  } catch (err) {
    console.error("[Web Scraper] Generic search failed", err.message);
    return {
      isFound: false,
      phone: null,
      address: null,
      website: null,
      categories: null,
      sources: []
    };
  }
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
