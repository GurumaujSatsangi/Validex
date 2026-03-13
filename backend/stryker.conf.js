/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'jest',
  jest: {
    configFile: undefined,
    enableFindRelatedTests: true
  },
  mutate: ['services/utils/scoringUtils.js'],
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  coverageAnalysis: 'off',
  reporters: ['clear-text', 'progress', 'html'],
  thresholds: {
    high: 80,
    low: 60,
    break: 50
  }
};
