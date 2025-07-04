# Angular i18n Text Extractor

A Node.js CLI utility that extracts display text from Angular applications and generates JSON files for internationalization.

## Features

- 🔍 Extracts text from Angular HTML templates
- 📝 Extracts string literals from TypeScript component files
- 🌍 Generates JSON translation files
- 🔄 Optionally replaces extracted text with i18n pipe placeholders
- ⚙️ Configurable key prefixes and output paths

## Installation

```bash
npm install -g angular-i18n-extractor
```

Or run directly with npx:

```bash
npx angular-i18n-extractor extract
```

## Usage

### Basic Usage

```bash
ng-i18n-extract extract
```

### With Options

```bash
ng-i18n-extract extract \
  --src ./src/app \
  --output ./i18n/en.json \
  --locale en \
  --key-prefix myapp \
  --replace
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--src` | `-s` | Source directory path | `./src` |
| `--output` | `-o` | Output JSON file path | `./i18n/messages.json` |
| `--locale` | `-l` | Locale code for extraction | `en` |
| `--key-prefix` | `-k` | Prefix for generated keys | `app` |
| `--replace` | `-r` | Replace text with i18n placeholders | `false` |

## What It Extracts

### HTML Templates
- Text content within HTML elements
- Attribute values: `title`, `alt`, `placeholder`, `aria-label`

### TypeScript Files
- String literals that appear to be user-facing text
- Excludes technical strings like URLs, paths, and identifiers

## Output Format

The generated JSON file contains:

```json
{
  "locale": "en",
  "translations": {
    "app.welcome_message_1": "Welcome to our application",
    "app.submit_button_2": "Submit",
    "app.error_message_3": "An error occurred"
  },
  "metadata": {
    "extractedAt": "2024-01-01T12:00:00.000Z",
    "totalTexts": 3,
    "keyPrefix": "app"
  }
}
```

## Text Replacement

When using the `--replace` option, the tool will:

### HTML Templates
Replace text content with Angular i18n pipe:
```html
<!-- Before -->
<h1>Welcome</h1>
<button title="Click me">Submit</button>

<!-- After -->
<h1>{{ 'app.welcome_1' | translate }}</h1>
<button title="{{ 'app.click_me_2' | translate }}">{{ 'app.submit_3' | translate }}</button>
```

### TypeScript Files
Replace string literals with translation service calls:
```typescript
// Before
this.message = "Hello World";

// After
this.message = this.translate.get('app.hello_world_1');
```

## Examples

### Extract without replacement
```bash
ng-i18n-extract extract --src ./src --output ./i18n/en.json
```

### Extract and replace with custom prefix
```bash
ng-i18n-extract extract --src ./src --output ./i18n/en.json --key-prefix myapp --replace
```

### Extract specific locale
```bash
ng-i18n-extract extract --locale es --output ./i18n/es.json
```

## Requirements

- Node.js >= 16.0.0
- Angular project structure

## License

MIT