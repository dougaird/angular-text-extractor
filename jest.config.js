module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(js|ts)',
    '**/*.(test|spec).(js|ts)'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable only when running coverage command
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!bin/**/*.js',        // Exclude CLI wrapper from coverage
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  
  // Coverage output directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Brief summary
    'html',           // HTML report
    'lcov',           // For CI/CD integration
    'json'            // JSON format
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Specific thresholds for key files
    './src/extractor.js': {
      branches: 78,
      functions: 90,
      lines: 85,
      statements: 85
    }
  },
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/test-.*/',
    '/fresh-.*/',
    '/temp-.*/'
  ],
  
  // Setup files
  setupFilesAfterEnv: [],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: false
};