const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const cheerio = require('cheerio');

class TextExtractor {
  constructor(options) {
    this.options = options;
    this.extractedTexts = new Map();
    this.keyCounter = 1;
    this.currentComponentContext = null;
  }

  extractComponentName(filePath) {
    const path = require('path');
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Common Angular patterns
    const patterns = [
      // Remove common suffixes: .component, .service, .directive, .pipe, .guard, .resolver
      /\.(component|service|directive|pipe|guard|resolver|module|spec|test)$/i,
      // Remove common prefixes
      /^(app-|ng-)/i
    ];
    
    let componentName = fileName;
    patterns.forEach(pattern => {
      componentName = componentName.replace(pattern, '');
    });
    
    // Convert kebab-case to camelCase and abbreviate if needed
    const camelCase = componentName
      .split('-')
      .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    // Create abbreviation if name is too long
    if (camelCase.length > 15) {
      // Take first letter of each word/segment
      const abbreviated = componentName
        .split('-')
        .map(word => word.charAt(0))
        .join('')
        .toLowerCase();
      return abbreviated.length >= 2 ? abbreviated : camelCase.substring(0, 10);
    }
    
    return camelCase || 'comp';
  }

  setComponentContext(filePath) {
    this.currentComponentContext = this.extractComponentName(filePath);
  }

  generateKey(text, filePath = null) {
    const cleanText = text.trim().toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 25); // Reduced to make room for component name
    
    // Use provided filePath or current context
    const componentContext = filePath ? this.extractComponentName(filePath) : this.currentComponentContext;
    const contextPart = componentContext ? `${componentContext}.` : '';
    
    return `${this.options.keyPrefix}.${contextPart}${cleanText}_${this.keyCounter++}`;
  }

  async extractFromHtmlTemplate(filePath) {
    try {
      // Set component context based on file path
      this.setComponentContext(filePath);
      
      const content = await fs.readFile(filePath, 'utf8');
      // Use cheerio only for parsing and finding elements, not for final output
      const $ = cheerio.load(content, {
        xmlMode: false,
        decodeEntities: false,
        lowerCaseAttributeNames: false,
        lowerCaseTags: false,
        recognizeSelfClosing: true
      });
      
      // Store text replacements to apply to original content
      const textReplacements = [];
      const attributeReplacements = [];
      const processedElements = new Set();

      // Define elements that typically contain translatable content (ordered by specificity)
      const contentElements = ['button', 'a', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'span', 'strong', 'em', 'b', 'i'];
      
      // Process elements that might contain mixed content (text + HTML)
      // Process in order of specificity to avoid parent elements interfering
      contentElements.forEach(tagName => {
        $(tagName).each((index, domElement) => {
          const $el = $(domElement);
          
          // Skip if this element is nested inside another content element we've already processed
          if (processedElements.has(domElement)) {
            return;
          }
          
          // Skip container elements that are too generic unless they have no content children
          if (['div', 'span'].includes(tagName)) {
            const hasContentChildren = $el.find('p, li, h1, h2, h3, h4, h5, h6, button, label, a').length > 0;
            if (hasContentChildren) {
              return;
            }
          }
          
          // Check if element contains any text content
          const fullText = $el.text().trim();
          if (!fullText || this.isExcluded(fullText)) {
            return;
          }
          
          // Skip if this looks like already-translated content
          if (fullText.includes("{{ '") && fullText.includes("' | translate }}")) {
            return;
          }
          
          // Skip if text contains Angular interpolation {{ }}
          if (fullText.includes('{{') && fullText.includes('}}')) {
            return;
          }
          
          // Skip if element has Angular directives that might contain text values that shouldn't be extracted
          if (domElement.attribs) {
            const hasProblematicDirectives = Object.keys(domElement.attribs).some(attr => {
              const value = domElement.attribs[attr];
              // Skip if directive contains expressions or interpolations
              return (attr.startsWith('*ng') || 
                      attr.startsWith('[') || 
                      attr.startsWith('(') ||
                      /^(ngIf|ngFor|ngClass|ngStyle)$/.test(attr)) &&
                     (value.includes('{{') || value.includes('}}') || 
                      value.includes('(') || value.includes(')') ||
                      value.includes('[') || value.includes(']') ||
                      /^\s*\w+\s*$/.test(value) || // Simple variable references
                      /\w+\.\w+/.test(value)); // Property access
            });
            
            if (hasProblematicDirectives) {
              return;
            }
          }
          
          // Check if element has child elements with text (mixed content)
          const hasChildElements = $el.find('*').length > 0;
          const htmlContent = $el.html();
          
          if (hasChildElements && this.containsTranslatableText(htmlContent)) {
            // Extract the full HTML content including nested tags
            const key = this.generateKey(fullText);
            this.extractedTexts.set(key, htmlContent);
            
            if (this.options.replace) {
              // Store replacement for the entire HTML content
              textReplacements.push({
                originalText: htmlContent,
                newText: `{{ '${key}' | translate }}`,
                fullMatch: true
              });
            }
            
            // Mark this element and its children as processed
            processedElements.add(domElement);
            $el.find('*').each((i, child) => processedElements.add(child));
          } else if (!hasChildElements) {
            // Simple text content without child elements
            if (!this.isExcluded(fullText)) {
              const key = this.generateKey(fullText);
              this.extractedTexts.set(key, fullText);
              
              if (this.options.replace) {
                // Store replacement for text content only
                textReplacements.push({
                  originalText: fullText,
                  newText: `{{ '${key}' | translate }}`,
                  fullMatch: false
                });
              }
            }
            processedElements.add(domElement);
          }
        });
      });

      // Extract attribute values that contain display text
      $('*').each((index, element) => {
        const $el = $(element);
        const attributes = ['title', 'alt', 'placeholder', 'aria-label'];
        
        attributes.forEach(attr => {
          const attrValue = $el.attr(attr);
          if (attrValue && attrValue.trim() && !this.isExcluded(attrValue)) {
            // Skip if attribute value contains Angular interpolation or expressions
            if (attrValue.includes('{{') || attrValue.includes('}}') || 
                attrValue.includes('[') || attrValue.includes('(')) {
              return;
            }
            
            const key = this.generateKey(attrValue);
            this.extractedTexts.set(key, attrValue);
            
            if (this.options.replace) {
              attributeReplacements.push({
                attribute: attr,
                originalValue: attrValue,
                newValue: `{{ '${key}' | translate }}`,
                element: element
              });
            }
          }
        });
      });

      // Apply replacements to original content
      if (this.options.replace && (textReplacements.length > 0 || attributeReplacements.length > 0)) {
        let modifiedContent = content;
        
        // Apply text replacements (sort by length descending to avoid partial replacements)
        textReplacements
          .sort((a, b) => b.originalText.length - a.originalText.length)
          .forEach(replacement => {
            // Use precise replacement to avoid changing formatting
            modifiedContent = modifiedContent.replace(
              new RegExp(this.escapeRegExp(replacement.originalText), 'g'),
              replacement.newText
            );
          });
        
        // Apply attribute replacements
        attributeReplacements.forEach(replacement => {
          const attrPattern = new RegExp(
            `(${replacement.attribute}\\s*=\\s*["'])` + 
            this.escapeRegExp(replacement.originalValue) + 
            `(["'])`,
            'g'
          );
          modifiedContent = modifiedContent.replace(
            attrPattern,
            `$1${replacement.newValue}$2`
          );
        });
        
        await fs.writeFile(filePath, modifiedContent, 'utf8');
      }

    } catch (error) {
      console.warn(`Warning: Could not process HTML template ${filePath}:`, error.message);
    }
  }

  containsTranslatableText(htmlContent) {
    // Remove HTML tags and check if remaining text is translatable
    const textOnly = htmlContent.replace(/<[^>]*>/g, '').trim();
    
    // Skip already-translated content
    if (textOnly.includes("{{ '") && textOnly.includes("' | translate }}")) {
      return false;
    }
    
    return textOnly.length > 0 && !this.isExcluded(textOnly) && this.isDisplayText(textOnly);
  }




  isDisplayText(text, context = null) {
    const trimmed = text.trim();
    
    // Skip already-translated content
    if (/^[a-zA-Z0-9_.]+$/.test(trimmed) && trimmed.includes('.')) {
      // This looks like a translation key
      return false;
    }
    
    // Skip template literals with interpolation that looks like translation
    if (/^\$\{.*\}$/.test(trimmed) || /assets\/i18n\/.*\.json/.test(trimmed)) {
      return false;
    }
    
    // Skip interpolated strings with ${} format
    if (trimmed.includes('${') && trimmed.includes('}')) {
      return false;
    }
    
    // If we have context information, use it for better filtering
    if (context) {
      // Exclude strings based on context
      if (context.isImport || context.isRequire) {
        return false; // Import statements and require calls
      }
      
      if (context.isDecorator || context.isComponentDecorator) {
        return false; // Angular decorators like @Component, @Injectable
      }
      
      if (context.isConsole) {
        return false; // Console logs are for debugging, not user-facing
      }
      
      if (context.isThrow) {
        // Only include user-facing error messages, exclude technical ones
        return this.isUserFacingErrorMessage(trimmed);
      }
    }
    
    // Enhanced pattern-based exclusions
    const codePatterns = [
      // Package/module names
      /^@[\w-]+\/[\w-]+$/, // Scoped packages like @angular/core
      /^[\w-]+\/[\w-]+$/, // Package paths like some/module
      
      // File paths and URLs
      /^https?:\/\//, // URLs
      /^ftp:\/\//, // FTP URLs
      /^file:\/\//, // File URLs
      /^\w+:\/\//, // Any protocol
      /^\/[\/\w.-]*$/, // Absolute paths
      /^\.{1,2}\/[\/\w.-]*$/, // Relative paths
      /^[a-zA-Z]:[\\\/]/, // Windows paths like C:\path or C:/path
      /^~\//, // Home directory paths
      /\.(js|ts|html|css|scss|json|xml|yml|yaml)$/i, // File extensions
      /\/api\//, // API paths
      /\/assets\//, // Asset paths
      /^\.\/.*\.(js|ts|html|css)$/, // Relative file paths
      
      // Code identifiers and selectors
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/, // Simple identifiers (variables, functions)
      /^[A-Z_][A-Z0-9_]*$/, // Constants
      /^\w+\.\w+/, // Property access
      /^app-[\w-]+$/, // Angular component selectors
      
      // Template strings and interpolations
      /^\{\{.*\}\}$/, // Angular interpolations like {{title}}
      /^\$\{.*\}$/, // Template literal expressions
      
      // Technical strings
      /^\d+$/, // Pure numbers
      /^#[0-9a-fA-F]+$/, // Colors
      /^[a-zA-Z]+:[a-zA-Z0-9-]+$/, // CSS-like values
      /^[\w-]+\.[\w-]+$/, // File extensions or class.method
      
      // Angular/TypeScript specific
      /^ng[A-Z]/, // Angular directives/components
      /Component$|Service$|Directive$|Pipe$|Guard$|Resolver$|Module$/, // Angular class suffixes
      /^(app|src)\//, // Common Angular paths
      
      // Common technical constants
      /^(utf-8|utf8|ascii|base64|json|xml|html|css|js|ts)$/i,
      /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/, // HTTP methods
      /^(localhost|127\.0\.0\.1)/, // Local addresses
      
      // Version strings and technical IDs
      /^\d+\.\d+(\.\d+)?/, // Version numbers
      /^[a-f0-9]{8,}$/, // Hex IDs/hashes
      
      // Class selectors and technical strings
      /^\.[\w-]+$/, // CSS classes
      /^#[\w-]+$/, // IDs (not colors)
      
      // Constants and technical error codes
      /^[A-Z_][A-Z0-9_]*$/, // ALL_CAPS constants
    ];

    // Check if it matches any code pattern
    if (codePatterns.some(pattern => pattern.test(trimmed))) {
      return false;
    }
    
    // Check for very short strings that are likely not user-facing
    if (trimmed.length < 3) {
      return false;
    }
    
    // Must contain at least one space or be a meaningful word
    if (!trimmed.includes(' ') && trimmed.length < 5 && this.isCodeIdentifier(trimmed)) {
      return false;
    }
    
    return true;
  }

  isCodeIdentifier(text) {
    // Check if text looks like a code identifier (camelCase, snake_case, etc.)
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(text) && 
           !/^(error|warning|info|success|message|title|name|label|button|link|text|content)$/i.test(text);
  }

  isUserFacingErrorMessage(text) {
    // Determine if an error message is user-facing vs technical
    const technicalPatterns = [
      /undefined|null|NaN|TypeError|ReferenceError/, // Technical errors
      /failed to|cannot|unable to.*\w+\(\)/, // Technical failure messages
      /^[A-Z_][A-Z0-9_]*$/, // Constant-style error codes
      /\w+\.\w+|\w+\(\)/, // Method references
    ];
    
    return !technicalPatterns.some(pattern => pattern.test(text)) && 
           text.length > 10 && // User messages are usually longer
           /[a-z].*[a-z]/.test(text); // Contains lowercase letters (not just constants)
  }

  isExcluded(text) {
    const trimmed = text.trim();
    return trimmed.length === 0 || 
           trimmed.length < 2 || 
           /^\s*$/.test(trimmed) ||
           /^[0-9\s\-_.,;:!?()[\]{}]+$/.test(trimmed);
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async extractFromDirectory(dirPath) {
    const htmlFiles = glob.sync('**/*.html', { cwd: dirPath });

    console.log(`Found ${htmlFiles.length} HTML files`);

    // Process HTML templates
    for (const file of htmlFiles) {
      const fullPath = path.join(dirPath, file);
      await this.extractFromHtmlTemplate(fullPath);
    }
  }


  async saveToJSON(outputPath) {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    const translations = {};
    this.extractedTexts.forEach((value, key) => {
      translations[key] = value;
    });

    const output = {
      locale: this.options.locale,
      translations: translations,
      metadata: {
        extractedAt: new Date().toISOString(),
        totalTexts: this.extractedTexts.size,
        keyPrefix: this.options.keyPrefix
      }
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`💾 Saved ${this.extractedTexts.size} translations to ${outputPath}`);
  }
}

async function extractTexts(options) {
  const extractor = new TextExtractor(options);
  await extractor.extractFromDirectory(options.srcPath);
  await extractor.saveToJSON(options.outputPath);
}

module.exports = { extractTexts, TextExtractor };