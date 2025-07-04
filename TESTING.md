# Testing Guide

This project uses Jest for testing and code coverage analysis.

## Available Test Commands

### Basic Testing
```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs tests when files change)
npm run test:watch
```

### Coverage Testing
```bash
# Run tests with coverage report
npm run test:coverage

# Run tests with coverage and show HTML report location
npm run test:coverage:report

# Run tests with coverage in watch mode
npm run test:coverage:watch
```

## Coverage Reports

The project generates multiple coverage report formats:

- **Console Output**: Basic coverage summary displayed in terminal
- **HTML Report**: Detailed interactive report at `coverage/lcov-report/index.html`
- **LCOV**: For CI/CD integration at `coverage/lcov.info`
- **JSON**: Machine-readable format at `coverage/coverage-final.json`

## Coverage Thresholds

The project maintains high coverage standards:

- **Global Thresholds**:
  - Statements: 85%
  - Branches: 75%
  - Functions: 85%
  - Lines: 85%

- **Core Module (`src/extractor.js`)**:
  - Statements: 85%
  - Branches: 78%
  - Functions: 90%
  - Lines: 85%

## Test Structure

### Unit Tests
- **`src/extractor.test.js`**: Tests for the main TextExtractor class
  - Component-aware key generation and validation
  - Component name extraction from file paths
  - Text extraction from HTML templates with nested elements
  - Text extraction from TypeScript files
  - File processing and error handling
  - JSON output generation

- **`bin/cli.test.js`**: Tests for CLI functionality
  - Command configuration
  - Option parsing
  - Error handling
  - Integration testing

### Test Coverage Areas

1. **Text Extraction Logic**
   - HTML template parsing with nested elements
   - Context-aware TypeScript string literal extraction
   - Enhanced display text validation with code filtering
   - Comprehensive exclusion rules for technical strings

2. **File Processing**
   - File reading and writing
   - Error handling for missing files
   - Directory traversal

3. **CLI Interface**
   - Command-line argument parsing
   - Option validation
   - Help and version display

4. **Output Generation**
   - JSON structure creation
   - Translation key generation
   - Metadata inclusion

## Running Specific Tests

```bash
# Run tests for a specific file
npm test -- src/extractor.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="generateKey"

# Run tests with verbose output
npm test -- --verbose
```

## Continuous Integration

The coverage reports are generated in formats suitable for CI/CD:
- LCOV format for services like Codecov, Coveralls
- JSON format for custom analysis tools
- Text summary for build logs

## Adding New Tests

When adding new functionality:

1. Add corresponding test cases in the appropriate test file
2. Ensure new code meets coverage thresholds
3. Test both success and error scenarios
4. Update this documentation if needed

## Mock Usage

Tests use Jest mocks for:
- File system operations (`fs.promises`)
- External dependencies (`glob`, `cheerio`)
- Console output for testing CLI behavior

This ensures tests run quickly and reliably without external dependencies.