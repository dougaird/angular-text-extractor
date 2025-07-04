const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const cheerio = require('cheerio');

class TextExtractor {
  constructor(options) {
    this.options = options;
    this.extractedTexts = new Map();
    this.keyCounter = 1;
  }

  generateKey(text) {
    const cleanText = text.trim().toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30);
    
    return `${this.options.keyPrefix}.${cleanText}_${this.keyCounter++}`;
  }

  async extractFromHtmlTemplate(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const $ = cheerio.load(content);
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

        await fs.writeFile(filePath, $.html(), 'utf8');
      }

    } catch (error) {
      console.warn(`Warning: Could not process HTML template ${filePath}:`, error.message);
    }
  }

  containsTranslatableText(htmlContent) {
    // Remove HTML tags and check if remaining text is translatable
    const textOnly = htmlContent.replace(/<[^>]*>/g, '').trim();
    return textOnly.length > 0 && !this.isExcluded(textOnly) && this.isDisplayText(textOnly);
  }

  async extractFromTypeScriptFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const stringLiterals = this.extractStringLiterals(content);
      let modifiedContent = content;

      stringLiterals.forEach(literal => {
        if (!this.isExcluded(literal.value)) {
          const key = this.generateKey(literal.value);
          this.extractedTexts.set(key, literal.value);
          
          if (this.options.replace) {
            // Replace string literal with translation service call
            modifiedContent = modifiedContent.replace(
              literal.full,
              `this.translate.get('${key}')`
            );
          }
        }
      });

      if (this.options.replace && modifiedContent !== content) {
        await fs.writeFile(filePath, modifiedContent, 'utf8');
      }

    } catch (error) {
      console.warn(`Warning: Could not process TypeScript file ${filePath}:`, error.message);
    }
  }

  extractStringLiterals(content) {
    const literals = [];
    const regex = /(['"`])((?:(?!\1)[^\\]|\\.)*)(\1)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const value = match[2];
      if (value.length > 0 && this.isDisplayText(value)) {
        literals.push({
          full: match[0],
          value: value,
          quote: match[1]
        });
      }
    }

    return literals;
  }

  isDisplayText(text) {
    // Check if text looks like user-facing display text
    const exclusions = [
      /^[a-zA-Z0-9_-]+$/, // Simple identifiers
      /^https?:\/\//, // URLs
      /^\/[\/\w-]*$/, // Paths
      /^\w+\.\w+/, // Property access
      /^[A-Z_][A-Z0-9_]*$/, // Constants
      /^\d+$/, // Numbers
      /^#[0-9a-fA-F]+$/, // Colors
      /^[a-zA-Z]+:[a-zA-Z0-9-]+$/, // CSS-like values
    ];

    return !exclusions.some(pattern => pattern.test(text.trim()));
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
    const tsFiles = glob.sync('**/*.ts', { cwd: dirPath });

    console.log(`Found ${htmlFiles.length} HTML files and ${tsFiles.length} TypeScript files`);

    // Process HTML templates
    for (const file of htmlFiles) {
      const fullPath = path.join(dirPath, file);
      await this.extractFromHtmlTemplate(fullPath);
    }

    // Process TypeScript files
    for (const file of tsFiles) {
      const fullPath = path.join(dirPath, file);
      await this.extractFromTypeScriptFile(fullPath);
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