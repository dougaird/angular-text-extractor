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
      // Use cheerio options to preserve the original structure and not add html/body tags
      const $ = cheerio.load(content, {
        xmlMode: false,
        decodeEntities: false,
        withStartIndices: false,
        withEndIndices: false
      });
      const modifications = [];
      const processedElements = new Set();

      // Define elements that typically contain translatable content (ordered by specificity)
      const contentElements = ['button', 'a', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'span', 'strong', 'em', 'b', 'i'];
      
      // Process elements that might contain mixed content (text + HTML)
      // Process in order of specificity to avoid parent elements interfering
      contentElements.forEach(tagName => {
        $(tagName).each((index, element) => {
          const $el = $(element);
          
          // Skip if this element is nested inside another content element we've already processed
          if (processedElements.has(element)) {
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
          
          // Check if element has child elements with text (mixed content)
          const hasChildElements = $el.find('*').length > 0;
          const htmlContent = $el.html();
          
          if (hasChildElements && this.containsTranslatableText(htmlContent)) {
            // Extract the full HTML content including nested tags
            const key = this.generateKey(fullText);
            this.extractedTexts.set(key, htmlContent);
            
            if (this.options.replace) {
              modifications.push({
                element: $el,
                originalHtml: htmlContent,
                key: key,
                replaceEntireContent: true
              });
            }
            
            // Mark this element and its children as processed
            processedElements.add(element);
            $el.find('*').each((i, child) => processedElements.add(child));
          } else if (!hasChildElements) {
            // Simple text content without child elements
            if (!this.isExcluded(fullText)) {
              const key = this.generateKey(fullText);
              this.extractedTexts.set(key, fullText);
              
              if (this.options.replace) {
                modifications.push({
                  element: $el,
                  originalText: fullText,
                  key: key,
                  replaceEntireContent: false
                });
              }
            }
            processedElements.add(element);
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
            const key = this.generateKey(attrValue);
            this.extractedTexts.set(key, attrValue);
            
            if (this.options.replace) {
              $el.attr(attr, `{{ '${key}' | translate }}`);
            }
          }
        });
      });

      // Apply text replacements
      if (this.options.replace) {
        modifications.forEach(mod => {
          if (mod.replaceEntireContent) {
            // Replace entire HTML content
            mod.element.html(`{{ '${mod.key}' | translate }}`);
          } else {
            // Replace just the text content
            mod.element.text(`{{ '${mod.key}' | translate }}`);
          }
        });

        // Extract only the inner content without the auto-added html/body wrapper
        let modifiedHtml = $.html();
        
        // Remove auto-added html/body tags that Cheerio adds
        if (modifiedHtml.startsWith('<html><head></head><body>') && modifiedHtml.endsWith('</body></html>')) {
          modifiedHtml = modifiedHtml.slice(25, -14); // Remove wrapper tags
        }
        
        await fs.writeFile(filePath, modifiedHtml, 'utf8');
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

  async extractFromTypeScriptFile(filePath) {
    try {
      // Set component context based on file path
      this.setComponentContext(filePath);
      
      const content = await fs.readFile(filePath, 'utf8');
      const stringLiterals = this.extractStringLiterals(content);
      let modifiedContent = content;
      let hasReplacements = false;

      stringLiterals.forEach(literal => {
        if (!this.isExcluded(literal.value)) {
          const key = this.generateKey(literal.value);
          this.extractedTexts.set(key, literal.value);
          
          if (this.options.replace) {
            // Replace string literal with translation service call
            // Use pipe for simple assignments, observables for method calls
            const isInAssignment = /\w+\s*[:=]\s*$/.test(literal.context.beforeContext);
            const isInMethodCall = /\.\w+\s*\(\s*$/.test(literal.context.beforeContext);
            
            if (isInAssignment) {
              // For property assignments, use pipe
              modifiedContent = modifiedContent.replace(
                literal.full,
                `'${key}' | translate`
              );
            } else if (isInMethodCall) {
              // For method calls like alert(), use synchronous get
              modifiedContent = modifiedContent.replace(
                literal.full,
                `this.translate.instant('${key}')`
              );
            } else {
              // Default to synchronous instant translation
              modifiedContent = modifiedContent.replace(
                literal.full,
                `this.translate.instant('${key}')`
              );
            }
            hasReplacements = true;
          }
        }
      });

      if (this.options.replace && hasReplacements) {
        // Ensure TranslateService import and injection
        modifiedContent = this.ensureTranslateServiceIntegration(modifiedContent, filePath);
        await fs.writeFile(filePath, modifiedContent, 'utf8');
      }

    } catch (error) {
      console.warn(`Warning: Could not process TypeScript file ${filePath}:`, error.message);
    }
  }

  ensureTranslateServiceIntegration(content, filePath) {
    // Check if TranslateService is already imported
    const hasTranslateImport = /import.*TranslateService.*from\s+['"].*['"]/.test(content);
    
    if (!hasTranslateImport) {
      // Calculate correct relative path to shared/translate.service.ts
      const relativePath = this.calculateRelativePath(filePath);
      
      // Add TranslateService import
      const importMatch = content.match(/import.*from\s+['"]@angular\/core['"];?\s*\n/);
      if (importMatch) {
        const insertIndex = importMatch.index + importMatch[0].length;
        const importStatement = `import { TranslateService } from '${relativePath}';\n`;
        content = content.slice(0, insertIndex) + importStatement + content.slice(insertIndex);
      } else {
        // Add import at the top
        content = `import { TranslateService } from '${relativePath}';\n` + content;
      }
    }

    // Check if TranslateService is injected in constructor
    const hasTranslateInjection = /constructor\s*\([^)]*translate\s*:\s*TranslateService/.test(content);
    
    if (!hasTranslateInjection) {
      // Find constructor and add translate service injection
      const constructorMatch = content.match(/(constructor\s*\(\s*)(.*?)(\s*\)\s*{)/s);
      
      if (constructorMatch) {
        const beforeParams = constructorMatch[1];
        const params = constructorMatch[2].trim();
        const afterParams = constructorMatch[3];
        
        let newParams = params;
        if (params && !params.endsWith(',')) {
          newParams += ',\n    ';
        } else if (!params) {
          newParams = '\n    ';
        }
        newParams += 'private translate: TranslateService\n  ';
        
        const newConstructor = beforeParams + newParams + afterParams;
        content = content.replace(constructorMatch[0], newConstructor);
      } else {
        // Add constructor if it doesn't exist
        const classMatch = content.match(/(export\s+class\s+\w+.*?{)/s);
        if (classMatch) {
          const insertIndex = classMatch.index + classMatch[0].length;
          const constructor = '\n\n  constructor(private translate: TranslateService) {}\n';
          content = content.slice(0, insertIndex) + constructor + content.slice(insertIndex);
        }
      }
    }

    return content;
  }

  calculateRelativePath(filePath) {
    // Get the directory of the current file
    const fileDir = path.dirname(filePath);
    
    // Get the source directory being processed (this.options.srcPath or where shared folder is created)
    const sourceBaseDir = this.sourceBaseDir || path.dirname(filePath.split('/')[0]);
    
    // Calculate the relative path from the file directory to the source base directory
    const relativePath = path.relative(fileDir, sourceBaseDir);
    
    // If we're at the root level, shared is in the current directory
    if (!relativePath || relativePath === '.') {
      return './shared/translate.service';
    }
    
    // Otherwise, build the path to shared folder
    return path.join(relativePath, 'shared/translate.service').replace(/\\/g, '/');
  }

  extractStringLiterals(content) {
    const literals = [];
    
    // Use the original content but check for comments manually
    const stringPatterns = [
      /'([^'\\]|\\.)*'/g,  // Single quoted strings
      /"([^"\\]|\\.)*"/g,  // Double quoted strings
      /`([^`\\]|\\.)*`/g   // Template literals
    ];
    
    stringPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Skip if inside comment
        if (this.isInComment(content, match.index)) {
          continue;
        }
        
        const fullMatch = match[0];
        const value = fullMatch.slice(1, -1); // Remove quotes
        const context = this.getStringContext(content, match.index);
        
        if (value.length > 0 && this.isDisplayText(value, context)) {
          literals.push({
            full: fullMatch,
            value: value,
            quote: fullMatch[0],
            context: context
          });
        }
      }
    });

    return literals;
  }


  isInComment(content, position) {
    // Check if position is inside a comment
    const beforePosition = content.substring(0, position);
    
    // Check for line comments
    const lastLineStart = beforePosition.lastIndexOf('\n');
    const currentLine = content.substring(lastLineStart + 1, content.indexOf('\n', position) || content.length);
    const commentIndex = currentLine.indexOf('//');
    if (commentIndex !== -1 && position - lastLineStart - 1 > commentIndex) {
      return true;
    }
    
    // Check for block comments
    let blockCommentStart = -1;
    let blockCommentEnd = -1;
    let searchIndex = 0;
    
    while (searchIndex < position) {
      const nextStart = beforePosition.indexOf('/*', searchIndex);
      const nextEnd = beforePosition.indexOf('*/', searchIndex);
      
      if (nextStart !== -1 && nextStart < position) {
        blockCommentStart = nextStart;
        const correspondingEnd = content.indexOf('*/', nextStart + 2);
        if (correspondingEnd !== -1 && position < correspondingEnd) {
          return true;
        }
        searchIndex = nextStart + 2;
      } else {
        break;
      }
    }
    
    return false;
  }

  getStringContext(content, stringIndex) {
    // Get surrounding context to help determine if string is code-related
    const lineStart = content.lastIndexOf('\n', stringIndex) + 1;
    const lineEnd = content.indexOf('\n', stringIndex);
    const line = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
    
    // Get previous 200 characters for additional context
    const contextStart = Math.max(0, stringIndex - 200);
    const beforeContext = content.substring(contextStart, stringIndex);
    
    // Get more context to detect class-level definitions
    const largerContextStart = Math.max(0, stringIndex - 500);
    const largerContext = content.substring(largerContextStart, stringIndex);
    
    return {
      line: line,
      beforeContext: beforeContext.toLowerCase(),
      largerContext: largerContext,
      isImport: /^\s*import\s+/.test(line),
      isRequire: /require\s*\(\s*$/.test(beforeContext),
      isDecorator: /@\w+\s*\(\s*$/.test(beforeContext) || /@\w+\s*\(\s*{\s*[\w\s:,'"]*$/.test(beforeContext),
      isComponentDecorator: this.isInComponentDecorator(largerContext, stringIndex),
      isClassProperty: this.isClassLevelProperty(beforeContext),
      isMethodCall: /\.\w+\s*\(\s*$/.test(beforeContext),
      isProperty: /\w+\s*:\s*$/.test(beforeContext),
      isArray: /\[\s*$/.test(beforeContext) || /,\s*$/.test(beforeContext),
      isObjectKey: /{\s*$/.test(beforeContext) || /[,{]\s*\w*\s*$/.test(beforeContext),
      isConditional: /if\s*\(|switch\s*\(|case\s+/.test(beforeContext),
      isThrow: /throw\s+new\s+\w+\s*\(\s*$/.test(beforeContext),
      isConsole: /console\.\w+\s*\(\s*$/.test(beforeContext),
      isInMethod: this.isInsideMethod(largerContext)
    };
  }

  isInComponentDecorator(context, stringIndex) {
    // Check if we're inside @Component, @Injectable, etc. decorators
    const decoratorPattern = /@(Component|Injectable|Directive|Pipe|NgModule)\s*\(/g;
    let match;
    
    while ((match = decoratorPattern.exec(context)) !== null) {
      const decoratorStart = match.index;
      // Find the closing parenthesis of the decorator
      let parenCount = 1;
      let pos = decoratorStart + match[0].length;
      
      while (pos < context.length && parenCount > 0) {
        if (context[pos] === '(') parenCount++;
        if (context[pos] === ')') parenCount--;
        pos++;
      }
      
      // If string is within decorator bounds
      if (stringIndex >= decoratorStart + context.length - 500 && stringIndex <= pos + context.length - 500) {
        return true;
      }
    }
    
    return false;
  }

  isClassLevelProperty(beforeContext) {
    // Check if this is a class-level property (not inside a method)
    const lines = beforeContext.split('\n');
    const lastFewLines = lines.slice(-5).join('\n');
    
    // Look for patterns that indicate class-level properties
    return /^\s*(private|public|protected|readonly)?\s*\w+\s*[:=]\s*$/.test(lastFewLines) ||
           /^\s*\w+\s*[:=]\s*$/.test(lastFewLines);
  }

  isInsideMethod(context) {
    // Look for method signatures in the context
    const methodPatterns = [
      /\w+\s*\([^)]*\)\s*:\s*\w+\s*\{/g,  // method(): type {
      /\w+\s*\([^)]*\)\s*\{/g,            // method() {
      /constructor\s*\([^)]*\)\s*\{/g,     // constructor() {
      /=\s*\([^)]*\)\s*=>\s*\{/g,         // arrow functions
      /function\s+\w+\s*\([^)]*\)\s*\{/g   // function declarations
    ];
    
    let methodStart = -1;
    let bracesCount = 0;
    
    // Find the most recent method start
    for (const pattern of methodPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex
      while ((match = pattern.exec(context)) !== null) {
        const startPos = match.index + match[0].length;
        if (startPos > methodStart) {
          methodStart = startPos;
          bracesCount = 1; // We started inside a method
        }
      }
    }
    
    // If we found a method, check if we're still inside it by counting braces
    if (methodStart > -1) {
      const afterMethod = context.substring(methodStart);
      for (let i = 0; i < afterMethod.length; i++) {
        if (afterMethod[i] === '{') bracesCount++;
        if (afterMethod[i] === '}') bracesCount--;
        if (bracesCount === 0) {
          // We've left the method
          return false;
        }
      }
      return bracesCount > 0; // Still inside method if braces haven't closed
    }
    
    return false;
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
    
    // Skip single words (likely identifiers or simple values)
    if (!/\s/.test(trimmed) && trimmed.length < 25) {
      return false;
    }
    
    // Skip camelCase strings (likely identifiers)
    if (/^[a-z][a-zA-Z0-9]*$/.test(trimmed) && /[A-Z]/.test(trimmed)) {
      return false;
    }
    
    // Skip kebab-case strings (likely CSS classes or identifiers)
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(trimmed)) {
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
      
      // Exclude class-level properties that aren't user-facing (unless in method)
      if (context.isClassProperty && !context.isInMethod) {
        return false;
      }
      
      if (context.isThrow && context.isInMethod) {
        // Only include user-facing error messages in methods, exclude technical ones
        return this.isUserFacingErrorMessage(trimmed);
      }
      
      if (context.isThrow && !context.isInMethod) {
        return false; // Class-level error constants are not user-facing
      }
      
      if (context.isConsole) {
        return false; // Console logs are for debugging, not user-facing
      }
      
      // Property names in object literals (usually config/technical)
      if (context.isProperty && this.isCodeIdentifier(trimmed)) {
        return false;
      }
      
      // Items in arrays that look like code identifiers
      if (context.isArray && this.isCodeIdentifier(trimmed)) {
        return false;
      }
      
      // Only extract strings from methods, not class-level definitions
      if (!context.isInMethod && !this.isLikelyUserFacingContent(trimmed)) {
        return false;
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

  isLikelyUserFacingContent(text) {
    // Check if text looks like user-facing content even at class level
    const userFacingPatterns = [
      /welcome|hello|thank you|please|error|warning|success|message/i,
      /click|button|save|cancel|submit|login|logout/i,
      /your|you|we|our|this|that|here|there/i,
      /\s+.*\s+/ // Contains multiple words with spaces
    ];
    
    return userFacingPatterns.some(pattern => pattern.test(text)) && 
           text.length > 5 && 
           !this.isCodeIdentifier(text);
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
    // Store the source base directory for relative path calculations
    this.sourceBaseDir = dirPath;
    
    const htmlFiles = glob.sync('**/*.html', { cwd: dirPath });
    // Exclude test files from extraction
    const tsFiles = glob.sync('**/*.ts', { cwd: dirPath }).filter(file => 
      !file.includes('.spec.ts') && 
      !file.includes('.test.ts') && 
      !file.includes('test.ts') &&
      !file.includes('/tests/') &&
      !file.includes('/test/')
    );

    console.log(`Found ${htmlFiles.length} HTML files and ${tsFiles.length} TypeScript files`);

    // Create translate service infrastructure if replacing
    if (this.options.replace) {
      await this.ensureTranslateInfrastructure(dirPath);
    }

    // Process HTML templates
    for (const file of htmlFiles) {
      const fullPath = path.join(dirPath, file);
      await this.extractFromHtmlTemplate(fullPath);
    }

    // Process TypeScript files (unless excluded)
    if (!this.options.excludeTs) {
      for (const file of tsFiles) {
        const fullPath = path.join(dirPath, file);
        await this.extractFromTypeScriptFile(fullPath);
      }
    } else {
      console.log('TypeScript extraction skipped due to --exclude-ts option');
    }
  }

  async ensureTranslateInfrastructure(dirPath) {
    // Check if translate service already exists
    const translateServicePath = path.join(dirPath, 'shared', 'translate.service.ts');
    
    try {
      await fs.access(translateServicePath);
      console.log('TranslateService already exists');
    } catch {
      // Create shared directory if it doesn't exist
      const sharedDir = path.join(dirPath, 'shared');
      await fs.mkdir(sharedDir, { recursive: true });
      
      // Create translate service
      const translateServiceContent = `import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class TranslateService {
  private translations: { [key: string]: string } = {};
  private currentLang = 'en';

  constructor(private http: HttpClient) {}

  get(key: string): Observable<string> {
    const translation = this.translations[key];
    if (translation) {
      return of(translation);
    }
    
    // Return the key as fallback if translation not found
    return of(key);
  }

  instant(key: string): string {
    const translation = this.translations[key];
    if (translation) {
      return translation;
    }
    
    // Return the key as fallback if translation not found
    return key;
  }

  setDefaultLang(lang: string): void {
    this.currentLang = lang;
  }

  use(lang: string): Observable<any> {
    this.currentLang = lang;
    return this.loadTranslations(lang);
  }

  private loadTranslations(lang: string): Observable<any> {
    const url = \`assets/i18n/\${lang}.json\`;
    return this.http.get(url).pipe(
      map((translations: any) => {
        this.translations = { ...this.translations, ...translations.translations };
        return translations;
      }),
      catchError(() => {
        console.warn(\`Could not load translations for \${lang}\`);
        return of({});
      })
    );
  }
}
`;
      
      await fs.writeFile(translateServicePath, translateServiceContent, 'utf8');
      console.log(`Created TranslateService at ${translateServicePath}`);
    }

    // Check and update app.module.ts to include HttpClientModule
    await this.ensureAppModuleConfiguration(dirPath);
  }

  async ensureAppModuleConfiguration(dirPath) {
    const appModulePaths = [
      path.join(dirPath, 'app.module.ts'),
      path.join(dirPath, 'app', 'app.module.ts')
    ];

    let appModulePath = null;
    for (const modulePath of appModulePaths) {
      try {
        await fs.access(modulePath);
        appModulePath = modulePath;
        break;
      } catch {
        // Continue to next path
      }
    }

    if (!appModulePath) {
      console.warn('Could not find app.module.ts to configure HttpClientModule');
      return;
    }

    try {
      let content = await fs.readFile(appModulePath, 'utf8');
      
      // Check if HttpClientModule is already imported
      if (!content.includes('HttpClientModule')) {
        // Add HttpClientModule import
        const angularCommonImport = content.match(/import.*from\s+['"]@angular\/common['"];?\s*\n/);
        if (angularCommonImport) {
          const insertIndex = angularCommonImport.index + angularCommonImport[0].length;
          content = content.slice(0, insertIndex) + 
                   "import { HttpClientModule } from '@angular/common/http';\n" + 
                   content.slice(insertIndex);
        }

        // Add to imports array
        const importsMatch = content.match(/(imports:\s*\[)([\s\S]*?)(\])/);
        if (importsMatch) {
          const beforeImports = importsMatch[1];
          const imports = importsMatch[2].trim();
          const afterImports = importsMatch[3];
          
          let newImports = imports;
          if (imports && !imports.endsWith(',')) {
            newImports += ',\n    ';
          } else if (!imports) {
            newImports = '\n    ';
          }
          newImports += 'HttpClientModule\n  ';
          
          const newImportsSection = beforeImports + newImports + afterImports;
          content = content.replace(importsMatch[0], newImportsSection);
        }

        await fs.writeFile(appModulePath, content, 'utf8');
        console.log('Updated app.module.ts to include HttpClientModule');
      }
    } catch (error) {
      console.warn(`Could not update app.module.ts: ${error.message}`);
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