import { calculateConfidenceScore } from './scoringUtils.js';

describe('calculateConfidenceScore', () => {
  it('calculates weighted confidence score correctly for typical inputs', () => {
    const result = calculateConfidenceScore(0.8, 0.6, 0.4);
    expect(result).toBeCloseTo(0.66, 10);
  });

  it('calculates weighted confidence score correctly for decimal inputs', () => {
    const result = calculateConfidenceScore(0.73, 0.19, 0.91);
    expect(result).toBeCloseTo(0.604, 10);
  });

  it('returns 0 when all component scores are 0', () => {
    expect(calculateConfidenceScore(0, 0, 0)).toBe(0);
  });

  it('uses exact component weights when only one signal is present', () => {
    expect(calculateConfidenceScore(1, 0, 0)).toBe(0.5);
    expect(calculateConfidenceScore(0, 1, 0)).toBe(0.3);
    expect(calculateConfidenceScore(0, 0, 1)).toBe(0.2);
  });

  it('returns 1 when all component scores are 1', () => {
    expect(calculateConfidenceScore(1, 1, 1)).toBe(1);
  });

  it('honors boundary combinations near extremes', () => {
    expect(calculateConfidenceScore(1, 1, 0)).toBeCloseTo(0.8, 10);
    expect(calculateConfidenceScore(1, 0, 1)).toBeCloseTo(0.7, 10);
    expect(calculateConfidenceScore(0, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it('changes by exactly 0.05 when sourceScore increases by 0.1', () => {
    const base = calculateConfidenceScore(0.4, 0.5, 0.6);
    const changed = calculateConfidenceScore(0.5, 0.5, 0.6);
    expect(changed - base).toBeCloseTo(0.05, 10);
  });

  it('changes by exactly 0.03 when addressScore increases by 0.1', () => {
    const base = calculateConfidenceScore(0.4, 0.5, 0.6);
    const changed = calculateConfidenceScore(0.4, 0.6, 0.6);
    expect(changed - base).toBeCloseTo(0.03, 10);
  });

  it('changes by exactly 0.02 when phoneScore increases by 0.1', () => {
    const base = calculateConfidenceScore(0.4, 0.5, 0.6);
    const changed = calculateConfidenceScore(0.4, 0.5, 0.7);
    expect(changed - base).toBeCloseTo(0.02, 10);
  });

  it('throws TypeError for non-number inputs', () => {
    expect(() => calculateConfidenceScore('0.8', 0.6, 0.4)).toThrow(TypeError);
    expect(() => calculateConfidenceScore(0.8, null, 0.4)).toThrow(TypeError);
    expect(() => calculateConfidenceScore(0.8, 0.6, undefined)).toThrow(TypeError);
  });

  it('throws TypeError for NaN and Infinity', () => {
    expect(() => calculateConfidenceScore(NaN, 0.6, 0.4)).toThrow(TypeError);
    expect(() => calculateConfidenceScore(0.8, Infinity, 0.4)).toThrow(TypeError);
    expect(() => calculateConfidenceScore(0.8, 0.6, -Infinity)).toThrow(TypeError);
  });

  it('throws RangeError for out-of-range numeric inputs', () => {
    expect(() => calculateConfidenceScore(-0.01, 0.6, 0.4)).toThrow(RangeError);
    expect(() => calculateConfidenceScore(0.8, 1.01, 0.4)).toThrow(RangeError);
    expect(() => calculateConfidenceScore(0.8, 0.6, 2)).toThrow(RangeError);
  });
});
