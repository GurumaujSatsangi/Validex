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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
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
          
          // Parse office hours into structured appointment timings
          const appointmentTimings = parseAppointmentTimings(hours);
          
          // Determine availability status
          const acceptingNewPatients = newPatients.toLowerCase().includes('yes');
          const teleheathAvailable = telehealth.toLowerCase().includes('yes');
          const hasAppointmentSlots = appointmentTimings.length > 0;
          
          let availabilityStatus = 'NO_INFO';
          if (hasAppointmentSlots && acceptingNewPatients) {
            availabilityStatus = 'ACCEPTING_APPOINTMENTS';
          } else if (hasAppointmentSlots) {
            availabilityStatus = 'LIMITED_AVAILABILITY';
          } else if (acceptingNewPatients) {
            availabilityStatus = 'ACCEPTING_NEW_PATIENTS';
          }
          
          providers.push({
            name,
            specialty,
            license_number: licenseMatch ? licenseMatch[1].trim() : null,
            license_state: stateMatch ? stateMatch[1].trim() : null,
            license_status: statusMatch ? statusMatch[1].trim() : null,
            affiliations,
            office_hours: hours,
            appointment_timings: appointmentTimings,
            accepting_new_patients: acceptingNewPatients,
            telehealth_available: teleheathAvailable,
            availability_status: availabilityStatus,
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
      if (matchedProvider.appointment_timings && matchedProvider.appointment_timings.length > 0) {
        console.log(`[TrueLens Website] ✓ Found ${matchedProvider.appointment_timings.length} appointment timing entries`);
      }
      if (matchedProvider.availability_status !== 'NO_INFO') {
        console.log(`[TrueLens Website] ✓ Availability status: ${matchedProvider.availability_status}`);
      }
      return { isFound: true, data: matchedProvider };
    }
    
    console.log(`[TrueLens Website] ✗ No match found for: ${providerName}`);
    return { isFound: false };
  } catch (error) {
    console.error('[TrueLens Website] Error:', error.message);
    return { isFound: false, error: error.message };
  }
}

/**
 * Parse office hours string into structured appointment timings
 * Handles formats like "Mon-Fri: 9:00 AM - 5:00 PM\nSat: 10:00 AM - 2:00 PM"
 * @param {string} hoursText - Raw office hours text
 * @returns {Array} Array of appointment timing objects
 */
function parseAppointmentTimings(hoursText) {
  if (!hoursText || hoursText.length === 0) return [];
  
  const timings = [];
  const lines = hoursText.split(/[\n;,]/).map(line => line.trim()).filter(line => line);
  
  for (const line of lines) {
    // Match patterns like "Monday: 9:00 AM - 5:00 PM" or "Mon-Fri: 9:00 AM - 5:00 PM"
    const match = line.match(/^([^:]+):\s*(.+?)(?:\s*[-–]\s*(.+))?$/i);
    
    if (match) {
      const dayPart = match[1].trim();
      const startTime = match[2].trim();
      const endTime = match[3] ? match[3].trim() : null;
      
      // Handle range formats like "Mon-Fri"
      if (dayPart.includes('-') || dayPart.includes('–')) {
        const dayRange = dayPart.split(/[-–]/).map(d => d.trim());
        if (dayRange.length === 2) {
          const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const dayAbbrev = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          
          const startDay = expandDayName(dayRange[0]);
          const endDay = expandDayName(dayRange[1]);
          const startIdx = daysOfWeek.findIndex(d => d.startsWith(startDay));
          const endIdx = daysOfWeek.findIndex(d => d.startsWith(endDay));
          
          if (startIdx !== -1 && endIdx !== -1) {
            for (let i = startIdx; i <= endIdx; i++) {
              timings.push({
                day: daysOfWeek[i],
                time_slots: endTime ? [`${startTime} - ${endTime}`] : [startTime],
                status: determineStatus(startTime, endTime),
                raw_text: line
              });
            }
            continue;
          }
        }
      }
      
      // Handle single day
      const day = expandDayName(dayPart);
      if (day) {
        timings.push({
          day: day,
          time_slots: endTime ? [`${startTime} - ${endTime}`] : [startTime],
          status: determineStatus(startTime, endTime),
          raw_text: line
        });
      }
    } else if (line.toLowerCase().includes('closed')) {
      // Handle "Closed" or "Sunday: Closed"
      const dayMatch = line.match(/^([^:]+):/i);
      if (dayMatch) {
        const day = expandDayName(dayMatch[1].trim());
        if (day) {
          timings.push({
            day: day,
            time_slots: [],
            status: 'CLOSED',
            raw_text: line
          });
        }
      }
    }
  }
  
  return timings;
}

/**
 * Expand day abbreviation to full name
 * @param {string} dayStr - Day abbreviation or full name
 * @returns {string|null} Full day name or null
 */
function expandDayName(dayStr) {
  const dayMap = {
    'mon': 'Monday',
    'monday': 'Monday',
    'tue': 'Tuesday',
    'tuesday': 'Tuesday',
    'wed': 'Wednesday',
    'wednesday': 'Wednesday',
    'thu': 'Thursday',
    'thursday': 'Thursday',
    'fri': 'Friday',
    'friday': 'Friday',
    'sat': 'Saturday',
    'saturday': 'Saturday',
    'sun': 'Sunday',
    'sunday': 'Sunday'
  };
  
  const normalized = dayStr.toLowerCase().trim();
  return dayMap[normalized] || null;
}

/**
 * Determine availability status from time slots
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @returns {string} Status: OPEN, CLOSED, etc.
 */
function determineStatus(startTime, endTime) {
  if (!startTime) return 'CLOSED';
  if (startTime.toLowerCase().includes('closed')) return 'CLOSED';
  if (startTime.toLowerCase().includes('by appointment')) return 'BY_APPOINTMENT';
  return 'OPEN';
}
