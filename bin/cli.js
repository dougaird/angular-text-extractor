#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const { extractTexts } = require('../src/extractor');

const program = new Command();

program
  .name('ng-i18n-extract')
  .description('Extract display text from Angular applications for internationalization')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract text from Angular components and templates')
  .option('-s, --src <path>', 'source directory path', './src')
  .option('-o, --output <path>', 'output JSON file path', './i18n/messages.json')
  .option('-l, --locale <locale>', 'locale code for the extraction', 'en')
  .option('-k, --key-prefix <prefix>', 'prefix for generated keys', 'app')
  .option('-r, --replace', 'replace text with i18n pipe placeholders', false)
  .option('--exclude-ts', 'skip TypeScript string extraction (HTML only)', false)
  .action(async (options) => {
    try {
      const srcPath = path.resolve(options.src);
      const outputPath = path.resolve(options.output);
      
      console.log(`Extracting texts from: ${srcPath}`);
      console.log(`Output file: ${outputPath}`);
      console.log(`Locale: ${options.locale}`);
      console.log(`Key prefix: ${options.keyPrefix}`);
      console.log(`Replace with placeholders: ${options.replace}`);
      console.log(`TypeScript extraction: ${options.excludeTs ? 'disabled' : 'enabled'}`);
      
      await extractTexts({
        srcPath,
        outputPath,
        locale: options.locale,
        keyPrefix: options.keyPrefix,
        replace: options.replace,
        excludeTs: options.excludeTs
      });
      
      console.log('✅ Text extraction completed successfully!');
    } catch (error) {
      console.error('❌ Error during extraction:', error.message);
      process.exit(1);
    }
  });

program.parse();