/**
 * Extracts ZIP code from address string
 * @param {string} address - Address string
 * @returns {string|null} ZIP code or null
 */
export function extractZip(address) {
  if (!address) return null;
  
  // Match 5-digit ZIP or ZIP+4 format
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

/**
 * Extracts city from address string
 * @param {string} address - Address string
 * @returns {string|null} City name or null
 */
export function extractCity(address) {
  if (!address) return null;
  
  // Typically city comes before state abbreviation
  const parts = address.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    return parts[parts.length - 3] || null;
  }
  
  return null;
}

/**
 * Extracts state abbreviation from address string
 * @param {string} address - Address string
 * @returns {string|null} State abbreviation (e.g., "IL") or null
 */
export function extractState(address) {
  if (!address) return null;
  
  // Match 2-letter state abbreviation followed by ZIP
  const stateMatch = address.match(/\b([A-Z]{2})\s+\d{5}/);
  return stateMatch ? stateMatch[1] : null;
}

/**
 * Normalizes address component for comparison (lowercase, trim, remove punctuation)
 * @param {string} text - Address component
 * @returns {string} Normalized text
 */
export function normalizeAddressComponent(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generic text normalization (lowercase, trim, handle common variations)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Legacy function kept for backwards compatibility
export function normalizeAddress(addr) {
  return normalizeAddressComponent(addr);
}
