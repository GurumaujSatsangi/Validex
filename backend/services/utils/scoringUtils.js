/**
 * Scoring Utilities for TrueLens Provider Validation
 * Implements similarity algorithms and weighted scoring logic
 */

/**
 * Tokenize a string into lowercase words
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase().match(/\b\w+\b/g) || [];
}

/**
 * Compute term frequency dictionary from tokens
 * @param {string[]} tokens
 * @returns {Object} - map of token -> frequency
 */
function getTermFrequency(tokens) {
  const freq = {};
  for (const token of tokens) {
    freq[token] = (freq[token] || 0) + 1;
  }
  return freq;
}

/**
 * Cosine similarity between two strings (0–1)
 * Tokenizes, builds TF vectors, computes cosine similarity
 * @param {string} textA
 * @param {string} textB
 * @returns {number} - similarity score 0–1
 */
export function cosineSimilarity(textA, textB) {
  if (!textA || !textB) return 0;

  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = getTermFrequency(tokensA);
  const freqB = getTermFrequency(tokensB);

  // Build union of all tokens
  const allTokens = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const token of allTokens) {
    const valA = freqA[token] || 0;
    const valB = freqB[token] || 0;

    dotProduct += valA * valB;
    magnitudeA += valA * valA;
    magnitudeB += valB * valB;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Jaro-Winkler similarity (0–1)
 * Measures edit distance with prefix weighting
 * @param {string} a
 * @param {string} b
 * @returns {number} - similarity score 0–1
 */
export function jaroWinkler(a, b) {
  if (!a || !b) return 0;

  a = String(a).toLowerCase();
  b = String(b).toLowerCase();

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Compute Jaro similarity first
  const len1 = a.length;
  const len2 = b.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  if (matchDistance < 0) matchDistance = 0;

  const aMatched = new Array(len1).fill(false);
  const bMatched = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Apply Winkler modification: add bonus for matching prefix
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (a[i] === b[i]) prefixLen++;
    else break;
  }

  const jw = jaro + prefixLen * 0.1 * (1 - jaro);
  return Math.min(1, jw);
}

/**
 * Levenshtein distance normalized to 0–1 similarity score
 * @param {string} a
 * @param {string} b
 * @returns {number} - similarity score 0–1
 */
export function levenshteinScore(a, b) {
  if (!a || !b) return 0;

  a = String(a).toLowerCase();
  b = String(b).toLowerCase();

  if (a === b) return 1;

  const len1 = a.length;
  const len2 = b.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1;

  // Compute Levenshtein distance using dynamic programming
  const dp = Array.from({ length: len1 + 1 }, (_, i) =>
    Array.from({ length: len2 + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = dp[len1][len2];
  return 1 - distance / maxLen;
}

/**
 * Address similarity using weighted combination of multiple algorithms
 * Handles null/undefined safely
 * Implements stricter matching with high threshold for suggestions
 * @param {string} addrA
 * @param {string} addrB
 * @param {number} strictThreshold - threshold above which addresses are considered too similar to suggest changes (default 0.90)
 * @returns {number} - similarity score 0–1
 */
export function addressSimilarity(addrA, addrB, strictThreshold = 0.90) {
  // Handle null/undefined
  if (!addrA || !addrB) return 0;

  const cosine = cosineSimilarity(addrA, addrB);
  const jw = jaroWinkler(addrA, addrB);
  const lev = levenshteinScore(addrA, addrB);

  // Weighted combination with emphasis on Jaro-Winkler for address strings
  return 0.4 * cosine + 0.45 * jw + 0.15 * lev;
}

/**
 * Compute source-weighted vote confidence
 * Sources have different reliability weights
 * @param {Object} sourceMatches - { npi, azure, scrape, pdf }
 *                 each is true/false indicating whether source matched
 * @returns {number} - weighted vote score 0–1
 */
export function sourceWeightedVote(sourceMatches) {
  if (!sourceMatches || typeof sourceMatches !== 'object') return 0;

  const weights = {
    npi: 0.95,
    azure: 0.85,
    scrape: 0.70,
    pdf: 0.60
  };

  let matchedWeight = 0;
  let totalWeight = 0;

  for (const [source, matched] of Object.entries(sourceMatches)) {
    const weight = weights[source.toLowerCase()] || 0;
    totalWeight += weight;
    if (matched) matchedWeight += weight;
  }

  if (totalWeight === 0) return 0;

  return matchedWeight / totalWeight;
}

/**
 * Compute final confidence score using weighted model
 * Combines source score, address score, and phone score
 * @param {Object} scores - { sourceScore, addressScore, phoneScore, hasMultipleSources, hasAuthoritativeSource }
 *                 each is 0–1 (except boolean flags)
 * @returns {number} - final confidence score 0–1
 */
export function finalScore(scores) {
  if (!scores || typeof scores !== 'object') return 0;

  const { 
    sourceScore = 0, 
    addressScore = 0, 
    phoneScore = 0,
    hasMultipleSources = false,
    hasAuthoritativeSource = false
  } = scores;

  // Clamp all scores to 0–1 range
  const clamped = {
    sourceScore: Math.max(0, Math.min(1, sourceScore)),
    addressScore: Math.max(0, Math.min(1, addressScore)),
    phoneScore: Math.max(0, Math.min(1, phoneScore))
  };

  // Base weighted score
  let finalConfidence = (
    0.5 * clamped.sourceScore +
    0.3 * clamped.addressScore +
    0.2 * clamped.phoneScore
  );

  // Ensure authoritative sources are not diluted by unrelated signals
  if (hasAuthoritativeSource) {
    finalConfidence = Math.max(finalConfidence, clamped.sourceScore);
  }

  // Boost confidence for authoritative sources (NPI, official certifications)
  if (hasAuthoritativeSource) {
    finalConfidence = Math.min(1, finalConfidence * 1.3); // 30% boost
  }

  // Boost confidence when multiple sources agree
  if (hasMultipleSources) {
    finalConfidence = Math.min(1, finalConfidence * 1.15); // 15% boost
  }

  return finalConfidence;
}

/**
 * Determine action based on confidence score
 * @param {number} confidence - 0–1 score
 * @param {number} threshold - default 0.45 (45%)
 * @returns {string} - "AUTO_ACCEPT" or "NEEDS_REVIEW"
 */
export function determineAction(confidence, threshold = 0.45) {
  return confidence >= threshold ? 'AUTO_ACCEPT' : 'NEEDS_REVIEW';
}

/**
 * Determine severity based on confidence score
 * @param {number} confidence - 0–1 score
 * @param {number} threshold - default 0.45 (45%)
 * @returns {string} - "HIGH" or "LOW"
 */
export function determineSeverity(confidence, threshold = 0.45) {
  return confidence >= threshold ? 'LOW' : 'HIGH';
}

/**
 * Check if an address suggestion should be made
 * Returns false if addresses are too similar (above similarity threshold)
 * @param {string} currentAddress - Current provider address
 * @param {string} suggestedAddress - Suggested address
 * @param {number} similarityThreshold - Above this, addresses are too similar to suggest (default 0.99 for exact matches only)
 * @returns {boolean} - True if suggestion should be made, false if addresses are too similar
 */
export function shouldSuggestAddressChange(currentAddress, suggestedAddress, similarityThreshold = 0.99) {
  if (!currentAddress || !suggestedAddress) return true;
  
  // If exact match, don't suggest
  if (currentAddress === suggestedAddress) return false;
  
  // Calculate similarity
  const similarity = addressSimilarity(currentAddress, suggestedAddress);
  
  // If too similar (>99%), don't suggest - this only allows exact or near-exact matches
  // Anything different enough (98.9% or less) should be reviewed
  if (similarity >= similarityThreshold) return false;
  
  return true;
}
