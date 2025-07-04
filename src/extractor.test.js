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
      expect(extractor.isDisplayText('Save your work')).toBe(true);
    });

    it('should return false for package/module imports', () => {
      expect(extractor.isDisplayText('@angular/core')).toBe(false);
      expect(extractor.isDisplayText('@angular/common')).toBe(false);
      expect(extractor.isDisplayText('rxjs/operators')).toBe(false);
      expect(extractor.isDisplayText('lodash/merge')).toBe(false);
    });

    it('should return false for simple identifiers', () => {
      expect(extractor.isDisplayText('someVariable')).toBe(false);
      expect(extractor.isDisplayText('user_id')).toBe(false);
      expect(extractor.isDisplayText('API_KEY')).toBe(false);
      expect(extractor.isDisplayText('userId')).toBe(false);
    });

    it('should return false for file paths', () => {
      expect(extractor.isDisplayText('./config/app.json')).toBe(false);
      expect(extractor.isDisplayText('../shared/utils')).toBe(false);
      expect(extractor.isDisplayText('/api/users')).toBe(false);
      expect(extractor.isDisplayText('src/app/components')).toBe(false);
    });

    it('should return false for URLs', () => {
      expect(extractor.isDisplayText('https://example.com')).toBe(false);
      expect(extractor.isDisplayText('http://localhost:3000')).toBe(false);
      expect(extractor.isDisplayText('ftp://files.example.com')).toBe(false);
    });

    it('should return false for Angular-specific patterns', () => {
      expect(extractor.isDisplayText('ngOnInit')).toBe(false);
      expect(extractor.isDisplayText('UserService')).toBe(false);
      expect(extractor.isDisplayText('AppComponent')).toBe(false);
      expect(extractor.isDisplayText('CustomDirective')).toBe(false);
    });

    it('should return false for technical constants', () => {
      expect(extractor.isDisplayText('utf-8')).toBe(false);
      expect(extractor.isDisplayText('application/json')).toBe(false);
      expect(extractor.isDisplayText('GET')).toBe(false);
      expect(extractor.isDisplayText('POST')).toBe(false);
    });

    it('should return false for version numbers and IDs', () => {
      expect(extractor.isDisplayText('1.2.3')).toBe(false);
      expect(extractor.isDisplayText('2.0.0-beta')).toBe(false);
      expect(extractor.isDisplayText('abc123def456')).toBe(false);
    });

    it('should return false for CSS classes and selectors', () => {
      expect(extractor.isDisplayText('.btn-primary')).toBe(false);
      expect(extractor.isDisplayText('#main-content')).toBe(false);
      expect(extractor.isDisplayText('color:red')).toBe(false);
    });

    it('should return false for very short strings', () => {
      expect(extractor.isDisplayText('ok')).toBe(false);
      expect(extractor.isDisplayText('no')).toBe(false);
      expect(extractor.isDisplayText('a')).toBe(false);
    });

    it('should handle context-aware filtering', () => {
      const importContext = { isImport: true };
      const decoratorContext = { isDecorator: true };
      const consoleContext = { isConsole: true };

      expect(extractor.isDisplayText('Hello World', importContext)).toBe(false);
      expect(extractor.isDisplayText('Component', decoratorContext)).toBe(false);
      expect(extractor.isDisplayText('Debug message', consoleContext)).toBe(false);
    });

    it('should distinguish user-facing vs technical error messages', () => {
      expect(extractor.isUserFacingErrorMessage('Please enter a valid email address')).toBe(true);
      expect(extractor.isUserFacingErrorMessage('Your session has expired')).toBe(true);
      expect(extractor.isUserFacingErrorMessage('TypeError: Cannot read property')).toBe(false);
      expect(extractor.isUserFacingErrorMessage('failed to connect()')).toBe(false);
      expect(extractor.isUserFacingErrorMessage('INVALID_CREDENTIALS')).toBe(false);
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

  describe('getStringContext', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should detect import statements', () => {
      const code = "import { Component } from '@angular/core';";
      const stringIndex = code.indexOf("'@angular/core'");
      const context = extractor.getStringContext(code, stringIndex);
      
      expect(context.isImport).toBe(true);
    });

    it('should detect require calls', () => {
      const code = "const fs = require('fs');";
      const stringIndex = code.indexOf("'fs'");
      const context = extractor.getStringContext(code, stringIndex);
      
      expect(context.isRequire).toBe(true);
    });

    it('should detect decorator usage', () => {
      const code = "@Component('app-user')";
      const stringIndex = code.indexOf("'app-user'");
      const context = extractor.getStringContext(code, stringIndex);
      
      expect(context.isDecorator).toBe(true);
    });

    it('should detect console statements', () => {
      const code = "console.log('Debug message');";
      const stringIndex = code.indexOf("'Debug message'");
      const context = extractor.getStringContext(code, stringIndex);
      
      expect(context.isConsole).toBe(true);
    });

    it('should detect property assignments', () => {
      const code = "const config = { apiUrl: 'http://localhost' };";
      const stringIndex = code.indexOf("'http://localhost'");
      const context = extractor.getStringContext(code, stringIndex);
      
      expect(context.isProperty).toBe(true);
    });
  });

  describe('extractStringLiterals', () => {
    let extractor;

    beforeEach(() => {
      extractor = new TextExtractor({ keyPrefix: 'test' });
    });

    it('should extract only user-facing string literals', () => {
      const code = `
        import { Component } from '@angular/core';
        
        export class UserComponent {
          title = 'User Profile';
          apiUrl = 'https://api.example.com';
          message = 'Welcome to your dashboard';
          
          constructor() {
            console.log('Component initialized');
          }
        }
      `;
      
      const literals = extractor.extractStringLiterals(code);
      
      // Should only extract user-facing messages
      const values = literals.map(l => l.value);
      expect(values).toContain('User Profile');
      expect(values).toContain('Welcome to your dashboard');
      expect(values).not.toContain('@angular/core');
      expect(values).not.toContain('https://api.example.com');
      expect(values).not.toContain('Component initialized');
    });

    it('should handle error messages appropriately', () => {
      const code = `
        if (!user) {
          throw new Error('Please log in to continue');
        }
        
        if (error) {
          throw new Error('TypeError: Cannot read property');
        }
      `;
      
      const literals = extractor.extractStringLiterals(code);
      const values = literals.map(l => l.value);
      
      // Should include user-facing error, exclude technical error
      expect(values).toContain('Please log in to continue');
      expect(values).not.toContain('TypeError: Cannot read property');
    });

    it('should filter out configuration and technical strings', () => {
      const code = `
        const config = {
          env: 'production',
          version: '1.2.3',
          features: ['auth', 'notifications'],
          title: 'My Application'
        };
      `;
      
      const literals = extractor.extractStringLiterals(code);
      const values = literals.map(l => l.value);
      
      // Should only extract user-facing title
      expect(values).toContain('My Application');
      expect(values).not.toContain('production');
      expect(values).not.toContain('1.2.3');
      expect(values).not.toContain('auth');
      expect(values).not.toContain('notifications');
    });

    it('should exclude specific code patterns mentioned in requirements', () => {
      const code = `
        import { Component } from '@angular/core';
        import * as utils from '../shared/utils';
        
        const API_ENDPOINTS = {
          users: '/api/v1/users',
          auth: '/auth/login'
        };
        
        @Component({
          selector: 'app-example'
        })
        export class ExampleComponent {
          // Class constants
          readonly LOG_LEVEL = 'debug';
          readonly FILE_PATH = './config/settings.json';
          
          // User-facing content
          pageTitle = 'Welcome to our platform';
          errorMessage = 'Please check your internet connection';
          
          constructor() {
            console.log('Component initialized');
            console.debug('Debug info for development');
          }
        }
      `;
      
      const literals = extractor.extractStringLiterals(code);
      const values = literals.map(l => l.value);
      
      // Should exclude all code-related strings
      expect(values).not.toContain('@angular/core');
      expect(values).not.toContain('../shared/utils');
      expect(values).not.toContain('/api/v1/users');
      expect(values).not.toContain('/auth/login');
      expect(values).not.toContain('app-example');
      expect(values).not.toContain('debug');
      expect(values).not.toContain('./config/settings.json');
      expect(values).not.toContain('Component initialized');
      expect(values).not.toContain('Debug info for development');
      
      // Should include user-facing content
      expect(values).toContain('Welcome to our platform');
      expect(values).toContain('Please check your internet connection');
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