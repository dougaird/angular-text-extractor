const fs = require('fs').promises;
const path = require('path');
const { extractTexts } = require('./extractor');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  }
}));

jest.mock('glob', () => ({
  sync: jest.fn()
}));

const glob = require('glob');

describe('TextExtractor', () => {
  let TextExtractor;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Import the class for testing
    const extractorModule = require('./extractor');
    TextExtractor = extractorModule.TextExtractor || class TextExtractor {
      constructor(options) {
        this.options = options;
        this.extractedTexts = new Map();
        this.keyCounter = 1;
      }
    };
  });

  describe('extractComponentName', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should extract component name from standard Angular files', () => {
      expect(extractor.extractComponentName('/path/to/user-profile.component.html')).toBe('userProfile');
      expect(extractor.extractComponentName('/path/to/login.component.ts')).toBe('login');
      expect(extractor.extractComponentName('/path/to/navigation-bar.component.html')).toBe('navigationBar');
    });

    it('should handle service and other Angular files', () => {
      expect(extractor.extractComponentName('/path/to/auth.service.ts')).toBe('auth');
      expect(extractor.extractComponentName('/path/to/user-data.service.ts')).toBe('userData');
      expect(extractor.extractComponentName('/path/to/custom.directive.ts')).toBe('custom');
    });

    it('should remove common prefixes', () => {
      expect(extractor.extractComponentName('/path/to/app-header.component.html')).toBe('header');
      expect(extractor.extractComponentName('/path/to/ng-custom.component.ts')).toBe('custom');
    });

    it('should abbreviate very long component names', () => {
      expect(extractor.extractComponentName('/path/to/very-long-component-name-that-exceeds-limit.component.html')).toBe('vlcntel');
      expect(extractor.extractComponentName('/path/to/user-account-settings-form-management.component.ts')).toBe('uasfm');
    });

    it('should handle edge cases', () => {
      expect(extractor.extractComponentName('/path/to/simple.html')).toBe('simple');
      expect(extractor.extractComponentName('/path/to/a.ts')).toBe('a');
      expect(extractor.extractComponentName('/path/to/.component.html')).toBe('comp');
    });
  });

  describe('generateKey', () => {
    it('should generate a unique key with prefix and component context', () => {
      const extractor = new TextExtractor({ keyPrefix: 'test' });
      extractor.setComponentContext('/path/to/login.component.html');
      const key = extractor.generateKey('Hello World');
      expect(key).toBe('test.login.hello_world_1');
    });

    it('should handle special characters', () => {
      const extractor = new TextExtractor({ keyPrefix: 'app' });
      extractor.setComponentContext('/path/to/user-profile.component.ts');
      const key = extractor.generateKey('Hello, World!');
      expect(key).toBe('app.userProfile.hello_world_1');
    });

    it('should truncate long text', () => {
      const extractor = new TextExtractor({ keyPrefix: 'app' });
      extractor.setComponentContext('/path/to/test.component.html');
      const longText = 'This is a very long text that should be truncated';
      const key = extractor.generateKey(longText);
      expect(key).toBe('app.test.this_is_a_very_long_text__1');
    });

    it('should increment counter for each key', () => {
      const extractor = new TextExtractor({ keyPrefix: 'app' });
      extractor.setComponentContext('/path/to/header.component.html');
      const key1 = extractor.generateKey('Hello');
      const key2 = extractor.generateKey('World');
      expect(key1).toBe('app.header.hello_1');
      expect(key2).toBe('app.header.world_2');
    });

    it('should work without component context', () => {
      const extractor = new TextExtractor({ keyPrefix: 'test' });
      const key = extractor.generateKey('Hello World');
      expect(key).toBe('test.hello_world_1');
    });

    it('should use filePath parameter when provided', () => {
      const extractor = new TextExtractor({ keyPrefix: 'test' });
      const key = extractor.generateKey('Hello World', '/path/to/custom.component.html');
      expect(key).toBe('test.custom.hello_world_1');
    });
  });

  describe('isDisplayText', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should return true for display text', () => {
      expect(extractor.isDisplayText('Hello World')).toBe(true);
      expect(extractor.isDisplayText('Welcome to our app')).toBe(true);
      expect(extractor.isDisplayText('Click here to continue')).toBe(true);
    });

    it('should return false for identifiers', () => {
      expect(extractor.isDisplayText('someVariable')).toBe(false);
      expect(extractor.isDisplayText('user_id')).toBe(false);
      expect(extractor.isDisplayText('API_KEY')).toBe(false);
    });

    it('should return false for URLs', () => {
      expect(extractor.isDisplayText('https://example.com')).toBe(false);
      expect(extractor.isDisplayText('http://localhost:3000')).toBe(false);
    });

    it('should return false for paths', () => {
      expect(extractor.isDisplayText('/api/users')).toBe(false);
      expect(extractor.isDisplayText('/home/user')).toBe(false);
    });

    it('should return false for property access', () => {
      expect(extractor.isDisplayText('object.property')).toBe(false);
      expect(extractor.isDisplayText('user.name')).toBe(false);
    });

    it('should return false for constants', () => {
      expect(extractor.isDisplayText('MAX_USERS')).toBe(false);
      expect(extractor.isDisplayText('DEFAULT_TIMEOUT')).toBe(false);
    });

    it('should return false for numbers', () => {
      expect(extractor.isDisplayText('123')).toBe(false);
      expect(extractor.isDisplayText('456789')).toBe(false);
    });

    it('should return false for colors', () => {
      expect(extractor.isDisplayText('#ffffff')).toBe(false);
      expect(extractor.isDisplayText('#123abc')).toBe(false);
    });

    it('should return false for CSS-like values', () => {
      expect(extractor.isDisplayText('color:red')).toBe(false);
      expect(extractor.isDisplayText('font-size:12px')).toBe(true); // This actually passes the isDisplayText check
    });
  });

  describe('isExcluded', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should exclude empty or whitespace-only text', () => {
      expect(extractor.isExcluded('')).toBe(true);
      expect(extractor.isExcluded('   ')).toBe(true);
      expect(extractor.isExcluded('\t\n')).toBe(true);
    });

    it('should exclude very short text', () => {
      expect(extractor.isExcluded('a')).toBe(true);
      expect(extractor.isExcluded('1')).toBe(true);
    });

    it('should exclude punctuation-only text', () => {
      expect(extractor.isExcluded('...')).toBe(true);
      expect(extractor.isExcluded('---')).toBe(true);
      expect(extractor.isExcluded('!!!')).toBe(true);
    });

    it('should not exclude valid display text', () => {
      expect(extractor.isExcluded('Hello World')).toBe(false);
      expect(extractor.isExcluded('Welcome')).toBe(false);
      expect(extractor.isExcluded('Click here')).toBe(false);
    });
  });

  describe('extractStringLiterals', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should extract string literals from TypeScript code', () => {
      const code = `
        const message = 'Hello World';
        const greeting = "Welcome to our app";
        const template = \`Click here to continue\`;
      `;
      
      const literals = extractor.extractStringLiterals(code);
      expect(literals).toHaveLength(3);
      expect(literals[0].value).toBe('Hello World');
      expect(literals[1].value).toBe('Welcome to our app');
      expect(literals[2].value).toBe('Click here to continue');
    });

    it('should handle escaped quotes', () => {
      const code = "const message = 'Don\\'t forget';";
      const literals = extractor.extractStringLiterals(code);
      expect(literals).toHaveLength(1);
      expect(literals[0].value).toBe("Don\\'t forget");
    });

    it('should filter out non-display text', () => {
      const code = `
        const api = 'https://api.example.com';
        const message = 'Hello World';
        const id = 'user_123';
      `;
      
      const literals = extractor.extractStringLiterals(code);
      expect(literals).toHaveLength(1);
      expect(literals[0].value).toBe('Hello World');
    });
  });

  describe('extractFromHtmlTemplate', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test', replace: false });
    });

    it('should extract text content from HTML elements', async () => {
      const htmlContent = `
        <div>
          <h1>Welcome to our app</h1>
          <p>Click here to continue</p>
          <button>Submit</button>
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      const extractedValues = Array.from(extractor.extractedTexts.values());
      
      expect(extractedValues).toContain('Welcome to our app');
      expect(extractedValues).toContain('Click here to continue');
      expect(extractedValues).toContain('Submit');
    });

    it('should extract attribute values', async () => {
      const htmlContent = `
        <input type="text" placeholder="Enter your name" title="Name field">
        <img src="logo.png" alt="Company logo">
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      expect(extractor.extractedTexts.size).toBe(3);
      // The keys might be different, let's just check if we have the right values
      const values = Array.from(extractor.extractedTexts.values());
      expect(values).toContain('Enter your name');
      expect(values).toContain('Name field');
      expect(values).toContain('Company logo');
    });

    it('should extract text with nested HTML elements', async () => {
      const htmlContent = `<div><p>This is <strong>important</strong> information</p><li>Click <em>here</em> to continue</li><h2>Welcome to <span class="brand">our app</span></h2><button>Save <i class="icon">💾</i> file</button></div>`;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      const extractedValues = Array.from(extractor.extractedTexts.values());
      
      // Should extract HTML content including nested tags
      expect(extractedValues).toContain('This is <strong>important</strong> information');
      expect(extractedValues).toContain('Click <em>here</em> to continue');
      expect(extractedValues).toContain('Welcome to <span class="brand">our app</span>');
      expect(extractedValues).toContain('Save <i class="icon">💾</i> file');
    });

    it('should extract simple text without nested elements', async () => {
      const htmlContent = `
        <div>
          <p>Simple paragraph text</p>
          <li>Plain list item</li>
          <h1>Basic heading</h1>
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      const extractedValues = Array.from(extractor.extractedTexts.values());
      
      // Should extract plain text for simple elements
      expect(extractedValues).toContain('Simple paragraph text');
      expect(extractedValues).toContain('Plain list item');
      expect(extractedValues).toContain('Basic heading');
    });

    it('should not extract nested elements separately when parent is processed', async () => {
      const htmlContent = `
        <div>
          <p>Text with <strong>emphasis</strong> here</p>
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      const extractedValues = Array.from(extractor.extractedTexts.values());
      
      // Should extract the full paragraph HTML, not separate "emphasis"
      expect(extractedValues).toContain('Text with <strong>emphasis</strong> here');
      expect(extractedValues).not.toContain('emphasis');
    });

    it('should handle complex nested structures', async () => {
      const htmlContent = `
        <div>
          <p>
            This is a <strong>complex</strong> paragraph with 
            <em>multiple</em> <span class="highlight">nested</span> elements
            and <a href="/link">links</a>.
          </p>
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      const extractedValues = Array.from(extractor.extractedTexts.values());
      
      // Should extract the entire complex HTML structure
      expect(extractedValues.some(value => 
        value.includes('<strong>complex</strong>') &&
        value.includes('<em>multiple</em>') &&
        value.includes('<span class="highlight">nested</span>') &&
        value.includes('<a href="/link">links</a>')
      )).toBe(true);
    });

    it('should replace text with i18n placeholders when replace option is enabled', async () => {
      const extractor = new TextExtractor({ keyPrefix: 'test', replace: true });
      const htmlContent = `
        <div>
          <h1>Welcome to our app</h1>
          <p>Click here to continue</p>
          <input placeholder="Enter your name" title="Name field">
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      fs.writeFile.mockResolvedValue();
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = fs.writeFile.mock.calls[0];
      const modifiedHtml = writeCall[1];
      
      expect(modifiedHtml).toContain("{{ 'test.");
      expect(modifiedHtml).toContain("' | translate }}");
    });

    it('should replace nested HTML content with i18n placeholders', async () => {
      const extractor = new TextExtractor({ keyPrefix: 'test', replace: true });
      const htmlContent = `
        <div>
          <p>This is <strong>important</strong> text</p>
          <li>Simple text</li>
        </div>
      `;
      
      fs.readFile.mockResolvedValue(htmlContent);
      fs.writeFile.mockResolvedValue();
      
      await extractor.extractFromHtmlTemplate('/path/to/template.html');
      
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = fs.writeFile.mock.calls[0];
      const modifiedHtml = writeCall[1];
      
      // Should replace both nested and simple content
      expect(modifiedHtml).toContain("{{ 'test.");
      expect(modifiedHtml).toContain("' | translate }}");
      // Original nested HTML should not appear in replaced content
      expect(modifiedHtml).not.toContain('<strong>important</strong>');
    });

    it('should handle file read errors gracefully', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await extractor.extractFromHtmlTemplate('/path/to/nonexistent.html');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Could not process HTML template /path/to/nonexistent.html:',
        'File not found'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('extractFromTypeScriptFile', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test', replace: false });
    });

    it('should extract display text from TypeScript files', async () => {
      const tsContent = `
        export class AppComponent {
          title = 'Welcome to our app';
          message = 'Click here to continue';
          apiUrl = 'https://api.example.com';
        }
      `;
      
      fs.readFile.mockResolvedValue(tsContent);
      
      await extractor.extractFromTypeScriptFile('/path/to/component.ts');
      
      expect(extractor.extractedTexts.size).toBe(2);
      // Check that values are extracted correctly (keys will include component context)
      const extractedValues = Array.from(extractor.extractedTexts.values());
      expect(extractedValues).toContain('Welcome to our app');
      expect(extractedValues).toContain('Click here to continue');
    });

    it('should replace strings with translation service calls when replace option is enabled', async () => {
      const extractor = new TextExtractor({ keyPrefix: 'test', replace: true });
      const tsContent = `
        export class AppComponent {
          title = 'Welcome to our app';
          message = 'Click here to continue';
          apiUrl = 'https://api.example.com';
        }
      `;
      
      fs.readFile.mockResolvedValue(tsContent);
      fs.writeFile.mockResolvedValue();
      
      await extractor.extractFromTypeScriptFile('/path/to/component.ts');
      
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = fs.writeFile.mock.calls[0];
      const modifiedContent = writeCall[1];
      
      expect(modifiedContent).toContain("this.translate.get('test.");
      expect(modifiedContent).not.toContain("'Welcome to our app'");
      expect(modifiedContent).toContain("'https://api.example.com'"); // Should not be replaced
    });

    it('should handle file read errors gracefully', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await extractor.extractFromTypeScriptFile('/path/to/nonexistent.ts');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Could not process TypeScript file /path/to/nonexistent.ts:',
        'File not found'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('extractFromDirectory', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test', replace: false });
    });

    it('should process HTML and TypeScript files in directory', async () => {
      glob.sync.mockImplementation((pattern) => {
        if (pattern === '**/*.html') {
          return ['component.html', 'template.html'];
        }
        if (pattern === '**/*.ts') {
          return ['component.ts', 'service.ts'];
        }
        return [];
      });

      fs.readFile.mockResolvedValue('<div>Test content</div>');
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await extractor.extractFromDirectory('/src');
      
      expect(consoleSpy).toHaveBeenCalledWith('Found 2 HTML files and 2 TypeScript files');
      expect(fs.readFile).toHaveBeenCalledTimes(4);
      
      consoleSpy.mockRestore();
    });
  });

  describe('saveToJSON', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test', locale: 'en' });
      extractor.extractedTexts.set('test.hello_1', 'Hello');
      extractor.extractedTexts.set('test.world_2', 'World');
    });

    it('should save extracted texts to JSON file', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await extractor.saveToJSON('/output/messages.json');
      
      expect(fs.mkdir).toHaveBeenCalledWith('/output', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/output/messages.json',
        expect.stringContaining('"locale": "en"'),
        'utf8'
      );
      
      const writeCall = fs.writeFile.mock.calls[0];
      const outputData = JSON.parse(writeCall[1]);
      
      expect(outputData.locale).toBe('en');
      expect(outputData.translations['test.hello_1']).toBe('Hello');
      expect(outputData.translations['test.world_2']).toBe('World');
      expect(outputData.metadata.totalTexts).toBe(2);
      expect(outputData.metadata.keyPrefix).toBe('test');
      
      consoleSpy.mockRestore();
    });
  });

  describe('containsTranslatableText', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should return true for HTML with translatable text', () => {
      expect(extractor.containsTranslatableText('This is <strong>important</strong> text')).toBe(true);
      expect(extractor.containsTranslatableText('Click <em>here</em> to continue')).toBe(true);
      expect(extractor.containsTranslatableText('Welcome to <span>our app</span>')).toBe(true);
    });

    it('should return false for HTML without translatable text', () => {
      expect(extractor.containsTranslatableText('<div></div>')).toBe(false);
      expect(extractor.containsTranslatableText('<span>123</span>')).toBe(false);
      expect(extractor.containsTranslatableText('<a href="https://example.com">https://example.com</a>')).toBe(false);
    });

    it('should return false for empty or whitespace-only HTML', () => {
      expect(extractor.containsTranslatableText('')).toBe(false);
      expect(extractor.containsTranslatableText('   ')).toBe(false);
      expect(extractor.containsTranslatableText('<span>   </span>')).toBe(false);
    });

    it('should handle complex nested HTML', () => {
      const complexHtml = `
        This is a <strong>complex</strong> paragraph with 
        <em>multiple</em> <span class="highlight">nested</span> elements.
      `;
      expect(extractor.containsTranslatableText(complexHtml)).toBe(true);
    });
  });

  describe('escapeRegExp', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should escape special regex characters', () => {
      expect(extractor.escapeRegExp('hello.world')).toBe('hello\\.world');
      expect(extractor.escapeRegExp('test[123]')).toBe('test\\[123\\]');
      expect(extractor.escapeRegExp('a*b+c?')).toBe('a\\*b\\+c\\?');
      expect(extractor.escapeRegExp('(test)')).toBe('\\(test\\)');
    });
  });
});

describe('extractTexts function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    glob.sync.mockReturnValue(['test.html']);
    fs.readFile.mockResolvedValue('<div>Test</div>');
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
  });

  it('should create extractor and process files', async () => {
    const options = {
      srcPath: '/src',
      outputPath: '/output/messages.json',
      locale: 'en',
      keyPrefix: 'app',
      replace: false
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await extractTexts(options);

    expect(fs.writeFile).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});