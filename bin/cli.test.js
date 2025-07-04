const path = require('path');
const { Command } = require('commander');

// Mock the extractor module
jest.mock('../src/extractor', () => ({
  extractTexts: jest.fn()
}));

const { extractTexts } = require('../src/extractor');

describe('CLI Configuration', () => {
  let program;
  let originalExit;
  let mockConsoleLog;
  let mockConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    extractTexts.mockClear();
    
    // Mock console methods
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock process.exit
    originalExit = process.exit;
    process.exit = jest.fn();
    
    // Create a new program instance for each test
    program = new Command();
    program
      .name('ng-i18n-extract')
      .description('Extract display text from Angular applications for internationalization')
      .version('1.0.0');
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    process.exit = originalExit;
  });

  describe('extract command configuration', () => {
    it('should configure extract command with correct options', () => {
      const extractCommand = program
        .command('extract')
        .description('Extract text from Angular components and templates')
        .option('-s, --src <path>', 'source directory path', './src')
        .option('-o, --output <path>', 'output JSON file path', './i18n/messages.json')
        .option('-l, --locale <locale>', 'locale code for the extraction', 'en')
        .option('-k, --key-prefix <prefix>', 'prefix for generated keys', 'app')
        .option('-r, --replace', 'replace text with i18n pipe placeholders', false);

      expect(extractCommand.name()).toBe('extract');
      expect(extractCommand.description()).toBe('Extract text from Angular components and templates');
      
      const options = extractCommand.options;
      expect(options).toHaveLength(5);
      
      // Check option configurations
      const srcOption = options.find(opt => opt.long === '--src');
      expect(srcOption).toBeDefined();
      expect(srcOption.defaultValue).toBe('./src');
      
      const outputOption = options.find(opt => opt.long === '--output');
      expect(outputOption).toBeDefined();
      expect(outputOption.defaultValue).toBe('./i18n/messages.json');
      
      const localeOption = options.find(opt => opt.long === '--locale');
      expect(localeOption).toBeDefined();
      expect(localeOption.defaultValue).toBe('en');
      
      const keyPrefixOption = options.find(opt => opt.long === '--key-prefix');
      expect(keyPrefixOption).toBeDefined();
      expect(keyPrefixOption.defaultValue).toBe('app');
      
      const replaceOption = options.find(opt => opt.long === '--replace');
      expect(replaceOption).toBeDefined();
      expect(replaceOption.defaultValue).toBe(false);
    });

    it('should handle successful extraction', async () => {
      extractTexts.mockResolvedValue();
      
      const mockAction = jest.fn(async (options) => {
        const srcPath = path.resolve(options.src);
        const outputPath = path.resolve(options.output);
        
        console.log(`Extracting texts from: ${srcPath}`);
        console.log(`Output file: ${outputPath}`);
        console.log(`Locale: ${options.locale}`);
        console.log(`Key prefix: ${options.keyPrefix}`);
        console.log(`Replace with placeholders: ${options.replace}`);
        
        await extractTexts({
          srcPath,
          outputPath,
          locale: options.locale,
          keyPrefix: options.keyPrefix,
          replace: options.replace
        });
        
        console.log('✅ Text extraction completed successfully!');
      });

      program
        .command('extract')
        .option('-s, --src <path>', 'source directory path', './src')
        .option('-o, --output <path>', 'output JSON file path', './i18n/messages.json')
        .option('-l, --locale <locale>', 'locale code for the extraction', 'en')
        .option('-k, --key-prefix <prefix>', 'prefix for generated keys', 'app')
        .option('-r, --replace', 'replace text with i18n pipe placeholders', false)
        .action(mockAction);

      await program.parseAsync(['node', 'cli.js', 'extract']);
      
      expect(mockAction).toHaveBeenCalledWith({
        src: './src',
        output: './i18n/messages.json',
        locale: 'en',
        keyPrefix: 'app',
        replace: false
      }, expect.any(Object));
      
      expect(extractTexts).toHaveBeenCalledWith({
        srcPath: expect.stringContaining('src'),
        outputPath: expect.stringContaining('messages.json'),
        locale: 'en',
        keyPrefix: 'app',
        replace: false
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Text extraction completed successfully!');
    });

    it('should handle extraction errors', async () => {
      extractTexts.mockRejectedValue(new Error('Extraction failed'));
      
      const mockAction = jest.fn(async (options) => {
        try {
          await extractTexts({
            srcPath: path.resolve(options.src),
            outputPath: path.resolve(options.output),
            locale: options.locale,
            keyPrefix: options.keyPrefix,
            replace: options.replace
          });
        } catch (error) {
          console.error('❌ Error during extraction:', error.message);
          process.exit(1);
        }
      });

      program
        .command('extract')
        .option('-s, --src <path>', 'source directory path', './src')
        .option('-o, --output <path>', 'output JSON file path', './i18n/messages.json')
        .option('-l, --locale <locale>', 'locale code for the extraction', 'en')
        .option('-k, --key-prefix <prefix>', 'prefix for generated keys', 'app')
        .option('-r, --replace', 'replace text with i18n pipe placeholders', false)
        .action(mockAction);

      await program.parseAsync(['node', 'cli.js', 'extract']);
      
      expect(mockConsoleError).toHaveBeenCalledWith('❌ Error during extraction:', 'Extraction failed');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle custom options', async () => {
      extractTexts.mockResolvedValue();
      
      const mockAction = jest.fn(async (options) => {
        await extractTexts({
          srcPath: path.resolve(options.src),
          outputPath: path.resolve(options.output),
          locale: options.locale,
          keyPrefix: options.keyPrefix,
          replace: options.replace
        });
      });

      program
        .command('extract')
        .option('-s, --src <path>', 'source directory path', './src')
        .option('-o, --output <path>', 'output JSON file path', './i18n/messages.json')
        .option('-l, --locale <locale>', 'locale code for the extraction', 'en')
        .option('-k, --key-prefix <prefix>', 'prefix for generated keys', 'app')
        .option('-r, --replace', 'replace text with i18n pipe placeholders', false)
        .action(mockAction);

      await program.parseAsync(['node', 'cli.js', 'extract', '--src', './custom-src', '--locale', 'fr', '--key-prefix', 'custom', '--replace']);
      
      expect(mockAction).toHaveBeenCalledWith({
        src: './custom-src',
        output: './i18n/messages.json',
        locale: 'fr',
        keyPrefix: 'custom',
        replace: true
      }, expect.any(Object));
      
      expect(extractTexts).toHaveBeenCalledWith({
        srcPath: expect.stringContaining('custom-src'),
        outputPath: expect.stringContaining('messages.json'),
        locale: 'fr',
        keyPrefix: 'custom',
        replace: true
      });
    });
  });
});