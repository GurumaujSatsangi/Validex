import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrape provider data from TrueLens appointment availability website
 */
export async function scrapeTrueLensWebsite(providerName) {
  try {
    console.log(`[TrueLens Website] Scraping data for: ${providerName}`);
    
    const url = 'https://truelens-appointment-availability.netlify.app/';
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const providers = [];
    
    // Parse table rows - try both tbody tr and just tr
    $('table tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 7) {
        const name = $(cells[0]).text().trim();
        const specialty = $(cells[1]).text().trim();
        const licenseInfo = $(cells[2]).text().trim();
        const affiliations = $(cells[3]).text().trim();
        const hours = $(cells[4]).text().trim();
        const newPatients = $(cells[5]).text().trim();
        const telehealth = $(cells[6]).text().trim();
        const contact = cells.length > 7 ? $(cells[7]).text().trim() : '';
        
        // Skip header rows
        if (name && !name.toLowerCase().includes('provider')) {
          // Extract license details
          const licenseMatch = licenseInfo.match(/License Number:\s*([^\n]+)/i);
          const stateMatch = licenseInfo.match(/State:\s*([^\n]+)/i);
          const statusMatch = licenseInfo.match(/Status:\s*([^\n]+)/i);
          
          // Extract contact details
          const phoneMatch = contact.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
          const addressMatch = contact.match(/Address:\s*(.+?)(?:\n|$)/i);
          
          providers.push({
            name,
            specialty,
            license_number: licenseMatch ? licenseMatch[1].trim() : null,
            license_state: stateMatch ? stateMatch[1].trim() : null,
            license_status: statusMatch ? statusMatch[1].trim() : null,
            affiliations,
            office_hours: hours,
            accepting_new_patients: newPatients.toLowerCase().includes('yes'),
            telehealth_available: telehealth.toLowerCase().includes('yes'),
            phone: phoneMatch ? phoneMatch[0].trim() : null,
            address: addressMatch ? addressMatch[1].trim() : null
          });
        }
      }
    });
    
    console.log(`[TrueLens Website] Found ${providers.length} providers`);
    
    // Search for matching provider by name (fuzzy match with strict requirements)
    const normalizedSearchName = providerName.toLowerCase().trim();
    
    // Try exact match first
    let matchedProvider = providers.find(p => 
      p.name.toLowerCase().trim() === normalizedSearchName
    );
    
    // If no exact match, try partial match (all parts must be present)
    if (!matchedProvider) {
      matchedProvider = providers.find(p => {
        const providerNameLower = p.name.toLowerCase();
        // Split and filter out very short parts and common titles
        const commonTitles = ['dr', 'md', 'do', 'pa', 'np', 'rn', 'mr', 'ms', 'mrs'];
        const searchNameParts = normalizedSearchName
          .split(/\s+/)
          .filter(part => part.length > 2 && !commonTitles.includes(part));
        
        // Require at least 2 significant parts and ALL must match
        if (searchNameParts.length < 2) return false;
        return searchNameParts.every(part => providerNameLower.includes(part));
      });
    }
    
    // If still no match, try reverse (provider name parts in search name) - very strict
    if (!matchedProvider) {
      matchedProvider = providers.find(p => {
        const commonTitles = ['dr', 'md', 'do', 'pa', 'np', 'rn', 'mr', 'ms', 'mrs'];
        const providerNameParts = p.name.toLowerCase()
          .split(/\s+/)
          .filter(part => part.length > 3 && !commonTitles.includes(part)); // Require 4+ chars
        
        const matchCount = providerNameParts.filter(part => 
          normalizedSearchName.includes(part)
        ).length;
        
        // Require at least 3 parts and all must match, or 2 parts and both must match
        const requiredMatches = providerNameParts.length >= 3 ? providerNameParts.length : 2;
        return providerNameParts.length >= 2 && matchCount >= requiredMatches;
      });
    }
    
    if (matchedProvider) {
      console.log(`[TrueLens Website] ✓ Found match: ${matchedProvider.name}`);
      return { isFound: true, data: matchedProvider };
    }
    
    console.log(`[TrueLens Website] ✗ No match found for: ${providerName}`);
    return { isFound: false };
  } catch (error) {
    console.error('[TrueLens Website] Error:', error.message);
    return { isFound: false, error: error.message };
  }
}
