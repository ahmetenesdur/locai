# locai 🌍

**Global, Framework-Agnostic, AI-Powered Translation CLI.**

Enterprise-grade localization tool that works with **any project** (Next.js, React, Vue, Flutter, Android, Python, etc.) and **any file format** (JSON, YAML, PO, Properties, ARB).

## Features

**Framework Agnostic**

- **ZERO Config:** Automatically detects your project type (Next.js, Vue, Flutter) and file structure.
- **Universal Support:** Works with standard web frameworks, mobile apps (Flutter, React Native), and backend systems (Django, Spring).

**Multi-Format Support**

- **JSON (.json)**: Default for web apps (i18next, react-intl).
- **YAML (.yaml/.yml)**: Concise config-style locales (Rails, refined DX).
- **Gettext (.po/.pot)**: Industry standard for PHP/WordPress/Python.
- **Properties (.properties)**: Java/Spring Boot and legacy systems.
- **ARB (.arb)**: Flutter application resource bundles.

**AI-Powered Translation**

- Support for 5 AI providers: OpenAI (GPT-4o), Gemini, DeepSeek, Dashscope, XAI
- **Context-Aware:** Detects if content is technical, marketing, legal, or UI and adjusts tone.
- **Smart Sync:** Only translates changed or new keys (SHA-256 change detection).
- **Vector Memory:** "Infinite Memory" reuses previous translations for 100% consistency and cost savings.

**Quality & Performance**

- **Robust Validation:** Checks placeholders (`{name}`), HTML tags, and quote balancing.
- **Style Guard:** Enforces tone (formal/informal) and conventions (Oxford comma).
- **Parallel Processing:** Fast execution with configurable concurrency and rate limiting.
- **Interactive Review:** TUI for reviewing low-confidence translations before saving.
- Automated validation and fixing of placeholders, HTML tags, and length
- Quality confidence scoring with interactive review workflow
- **Style Guard:** Tone verification and style guide enforcement (Oxford comma, sentence case)
- "Infinite Memory" (Vector Cache) for semantic recycling of translations
- Glossary management for consistent brand terminology

**Developer Experience**

- Real-time progress tracking with ETA
- Comprehensive configuration validation
- Debug mode with performance diagnostics
- Graceful shutdown with state preservation
- Interactive terminal UI for translation review

## Quick Start

### Installation

```bash
# Run directly without installation
npx locai translate --source en --targets tr,es,de

# Or install globally
npm install -g locai
locai translate
```

### Prerequisites

- **Node.js** >= 14.13.0 (v18+ recommended for ESM)
- At least one AI provider API key

## Configuration

The tool uses `c12` for configuration loading, supporting `.js`, `.ts`, and `.json` files.

### 1. Zero-Install Usage (Recommended for `npx`)

If you are running the tool via `npx` and don't want to install it as a dependency, use a standard `localize.config.js` file.

```javascript
// localize.config.js
export default {
	source: "en",
	targets: ["tr", "es", "de"],
	apiProvider: "openai",
	localesDir: "./locales",

	// Optional: API specific settings
	apiConfig: {
		openai: {
			model: "gpt-4",
		},
	},
};
```

### 2. TypeScript Usage (Enhanced)

If you have installed the package (`pnpm add -D locai`), you can use the `defineConfig` helper for full type safety.

```typescript
// localize.config.ts
import { defineConfig } from "locai";

export default defineConfig({
	source: "en",
	targets: ["tr", "es", "de"],
	apiProvider: "openai",

	// Optional: Override auto-detection
	localesDir: "./src/locales",
	fileOperations: {
		format: "yaml", // 'json', 'yaml', 'po', 'properties', 'arb', 'auto'
		fileStructure: "flat", // 'flat' (en.json) or 'nested' (en/common.json)
	},
});
```

### 3. Setup API Keys

Create a `.env` file with your provider credentials:

```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
DASHSCOPE_API_KEY=sk-...
XAI_API_KEY=xai-...
```

**Note:** You only need one provider to get started. The tool will use the available providers.

## Usage

### Basic Commands

```bash
# Validate configuration
locai validate-config

# Translate with config settings
locai

# Override target languages
locai -t tr,es,de

# Force update existing translations
locai translate --force

# Fix translation issues
locai fix

# Enable confidence scoring (0-1 scale)
locai translate --min-confidence 0.8 --save-review-queue

# Interactive review of low-confidence translations
locai review

# Export review queue
locai review --export json
locai review --export csv

# Debug mode
locai --debug
```

### Smart Synchronization

The tool uses SHA-256 hashing to detect changes:

**First run:**

```bash
locai
# First run - will process all keys
# Translates all 500 keys across 13 languages
```

**Subsequent runs:**

```bash
locai
# Sync Analysis:
#    New keys: 3
#    Modified keys: 1
#    Deleted keys: 2
# Only processes 4 keys instead of 500
```

**Smart Behavior:**

- **New keys** - Translated automatically
- **Modified keys** - Re-translated with context
- **Deleted keys** - Removed from all target files
- **Unchanged keys** - Skipped for performance

### Config Validation

Validate your configuration before running translations:

```bash
# Quick validation
locai validate-config

# Show warnings too
locai validate-config --show-warnings
```

**Example Output:**

```
Validating configuration...

Configuration is valid!

Configuration Summary:
   Source: en
   Targets: 13 languages (tr, de, es, fr, hi...)
   API Provider: openai
   Concurrency: 1 parallel operations
   Cache: Enabled
   Context Detection: AI-powered
   Fallback Chain: openai → dashscope → deepseek

Your configuration is ready to use.
```

**Validation covers 60+ settings:**

- Required fields (source, targets, localesDir)
- API provider names and configurations
- Performance settings (concurrency, cache, rate limits)
- Retry options and timeouts
- Context detection settings
- Quality check rules
- Length control modes
- Logical consistency (e.g., initialDelay < maxDelay)

### Enhanced Error Messages

Context-aware errors with actionable solutions and error codes (API 1xxx, Config 2xxx, File 3xxx, Validation 4xxx, Translation 5xxx). Use `--debug` for detailed diagnostics.

### Command Reference

<details>
<summary>All Options</summary>

#### Global Options

| Option          | Description          | Default             |
| --------------- | -------------------- | ------------------- |
| `-s, --source`  | Source language      | `config.source`     |
| `-t, --targets` | Target languages     | `config.targets`    |
| `--localesDir`  | Locales directory    | `config.localesDir` |
| `--debug`       | Enable debug mode    | `false`             |
| `--verbose`     | Detailed diagnostics | `false`             |

#### Commands

| Command           | Description                                |
| ----------------- | ------------------------------------------ |
| `translate`       | Translate missing strings                  |
| `fix`             | Fix issues in existing translations        |
| `review`          | Interactive review of low-confidence items |
| `analyze`         | Analyze context patterns                   |
| `validate-config` | Validate configuration file                |
| `advanced`        | Advanced configuration options             |

#### Translation Options

| Option                | Description                      | Default  |
| --------------------- | -------------------------------- | -------- |
| `--provider`          | AI provider                      | `openai` |
| `--concurrency`       | Concurrent translations          | `1`      |
| `--force`             | Update existing                  | `false`  |
| `--length`            | Length control mode              | `smart`  |
| `--stats`             | Show detailed stats              | `false`  |
| `--min-confidence`    | Minimum confidence threshold 0-1 | `0.0`    |
| `--save-review-queue` | Save low-confidence items        | `false`  |

#### Review Options

| Option     | Description                        | Values      |
| ---------- | ---------------------------------- | ----------- |
| `--export` | Export review queue to file format | `json, csv` |

</details>

## Providers & Performance

| Provider      | Model                | RPM  | Concurrency | Context Window |
| ------------- | -------------------- | ---- | ----------- | -------------- |
| **OpenAI**    | gpt-4o               | 1000 | 15          | 16K tokens     |
| **Gemini**    | gemini-2.0-flash-exp | 500  | 12          | 16K tokens     |
| **XAI**       | grok-4               | 300  | 10          | 8K tokens      |
| **Dashscope** | qwen-plus            | 200  | 8           | 8K tokens      |
| **DeepSeek**  | deepseek-chat        | 200  | 8           | 8K tokens      |

### Quality Assurance

| Feature                    | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| **Placeholder Validation** | Preserves `{variable}` patterns exactly                           |
| **HTML Preservation**      | Maintains `<tag>` structure and attributes                        |
| **Quote Balance Check**    | Detects and auto-fixes unbalanced quotes to prevent JSON errors   |
| **Length Control**         | 5 modes with language-specific rules                              |
| **Context Detection**      | AI-powered categorization (technical, marketing, legal, DeFi, UI) |
| **Confidence Scoring**     | Multi-factor quality scoring (0-1 scale) with review queue        |
| **Tone Verification**      | AI auditing of translation tone (e.g., ensuring "professional")   |
| **Style Enforcement**      | Checks for conventions like Oxford comma and sentence case        |
| **Glossary Management**    | Consistent brand terminology across all translations              |

### Glossary/Terminology Management

Ensure consistent brand terminology and technical terms across all your translations.

#### Key Features

- **Brand Consistency**: Keep product names, features, and brand terms consistent
- **Technical Terms**: Preserve technical acronyms like API, SDK, OAuth unchanged
- **Language-Specific**: Define different translations per target language
- **Case Sensitivity**: Control exact case matching for specific terms
- **Format Preservation**: Maintain capitalization from source text

### Quote Balance Validation

Automatically detects and fixes unbalanced quotation marks to prevent JSON parse errors. Supports single quotes (`'`), double quotes (`"`), French guillemets (`«»`), and German quotes (`„"`).

**Example:**

```json
// Invalid - missing closing quote
"part2": "'Go to stats page"

// Auto-fixed
"part2": "'Go to stats page'"
```

#### Configuration

Configure in `localize.config.js`:

```javascript
glossary: {
  enabled: true,
  caseSensitive: false,        // Default case matching
  preserveFormatting: true,    // Maintain source capitalization
  glossary: {
    // Simple: Keep term unchanged in all languages
    "API": "API",
    "SDK": "SDK",
    "OAuth": "OAuth",

    // Case-sensitive matching
    "DeFi": {
      translation: "DeFi",
      caseSensitive: true
    },

    // Language-specific translations
    "Dashboard": {
      "en": "Dashboard",
      "tr": "Kontrol Paneli",
      "de": "Dashboard",
      "es": "Panel de Control",
      "fr": "Tableau de Bord"
    }
  }
}
```

#### External Glossary File

Load glossary from a separate JSON file:

```javascript
import { readFileSync } from "fs";

const glossaryData = JSON.parse(readFileSync("./glossary.json", "utf8"));

export default {
	glossary: {
		enabled: true,
		glossary: glossaryData,
	},
};
```

#### How It Works

1. **Protection Phase**: Terms are replaced with tokens before translation
2. **Translation**: AI translates text with protected terms as placeholders
3. **Restoration**: Tokens are replaced with correct translations

#### Example

**Source (en.json)**:

```json
{
	"welcome": "Welcome to our API Dashboard",
	"defi": "DeFi staking available"
}
```

**Without Glossary**:

```json
// tr.json - API and Dashboard might be inconsistently translated
{
	"welcome": "API Gösterge Paneline Hoş Geldiniz",
	"defi": "DeFi stake etme mevcut"
}
```

**With Glossary**:

```json
// tr.json - Consistent terminology guaranteed
{
	"welcome": "API Kontrol Paneli'ne Hoş Geldiniz",
	"defi": "DeFi stake etme mevcut"
}
```

#### Best Practices

1. **Brand Terms**: Add all product names, feature names, and brand-specific terms
2. **Technical Acronyms**: Include API, SDK, JSON, REST, GraphQL, etc.
3. **Industry Terms**: Add domain-specific terminology (DeFi, NFT, Web3, etc.)
4. **UI Components**: Define consistent translations for Dashboard, Settings, Profile, etc.
5. **Start Small**: Begin with 10-20 critical terms, expand as needed

See `glossary.example.json` for a complete example.
| **Auto-Fix** | Corrects common issues automatically |

### Confidence Scoring System

**Multi-Factor Quality Assessment:**

- **AI Confidence** (40%): Provider's confidence in translation
- **Quality Checks** (30%): Placeholder, HTML, length, punctuation validation
- **Category Weight** (15%): Context-specific adjustments
- **Language Pair** (10%): Source-target language complexity
- **Provider Reliability** (5%): Historical provider performance

**Confidence Levels:**

- **High** (≥0.9): Auto-approved, production-ready
- **Medium** (≥0.7): Acceptable, minor review recommended
- **Low** (≥0.5): Needs review before deployment
- **Very Low** (<0.5): Manual review required

**Interactive Review Mode:**

```bash
# Enable confidence scoring
locai translate --min-confidence 0.8 --save-review-queue

# Start interactive review
locai review
```

**Review Interface:**

```
[1/3] Translation Review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key:        app.navigation.home
Language:   tr
Confidence: 0.82 (medium)
Category:   ui

Source:
  "Home"

Translation:
  "Ana Sayfa"

Actions:
  [A] Accept    [E] Edit    [R] Reject    [S] Skip
  [N] Next      [Q] Quit    [?] Help

Your choice:
```

**Export Review Queue:**

```bash
# Export to JSON
locai review --export json

# Export to CSV for spreadsheet tools
locai review --export csv
```

### Progress Tracking

```bash
⠋ [tr] [█████═════════] 50.0% | 250/500 items | OK 240 | ERR 10 | ETA: 25s
```

**Progress Bar Features:**

- Real-time spinner animation
- Visual progress bar with completion percentage
- Success/error counters (OK/ERR)
- Estimated time remaining (ETA)
- Language indicator for current target
- Items per second processing speed

### Infinite Memory (Vector Cache)

The tool includes a vector-based semantic cache ("Infinite Memory") that goes beyond simple key-value pairs.

**How it works:**

1.  **Exact Match (Similarity > 98%)**:
    If you translate a sentence that is identical (or nearly identical) to a previous translation, the tool reuses the previous result instantly. This saves AI costs and ensures 100% consistency.
2.  **Semantic Match (Similarity > 85%)**:
    If a new sentence is _similar_ to a previous one (e.g., "Hello world" vs "Hello there world"), the previous translation is retrieved and passed to the AI as context.
    > _Context Prompt:_ "Previously, a similar phrase 'Hello world' was translated as 'Hola mundo'. Please maintain consistency."

**Configuration:**

```javascript
vectorMemory: {
    enabled: true,
    // Use directly if similarity > 98%
    exactMatchThreshold: 0.98,
    // Use as context if similarity > 85%
    similarityThreshold: 0.85,
    // Uses local filesystem (no external DB required)
    vectorDbPath: "./.localize-cache/vector-memory",
}
```

**Benefits:**

- **Cost Reduction**: Reduces AI calls for repetitive content.
- **Consistency**: Ensures similar terminology is used across different parts of the app.
- **Privacy**: Runs entirely locally using `vectra` (stores embeddings in `.localize-cache`).

## Development

```bash
# Install dependencies
pnpm install

# Build the project (TypeScript -> JavaScript)
pnpm build

# Run CLI locally (Development)
pnpm dev

# Run CLI locally (Production/Compiled)
pnpm start

# Format with Prettier
pnpm format
pnpm format:check
```

### Project Structure

```
src/
├── commands/        # CLI commands (translate, fix, review, analyze)
│   ├── translator.ts         # Translation command
│   └── review.ts             # Interactive review TUI
├── core/           # Core orchestration and processing
│   ├── orchestrator.ts       # Main translation engine
│   ├── pipeline/             # Pipeline steps (Validation -> Cache -> Translation -> Quality)
│   ├── provider-factory.ts   # AI provider management
│   ├── fallback-provider.ts  # Fallback logic wrapper
│   └── context-processor.ts  # Context detection
├── services/       # Business logic services
│   └── translation-service.ts # High-level translation logic
├── providers/      # AI provider implementations
│   ├── base-provider.ts      # Base with confidence extraction
│   ├── openai.ts
│   ├── gemini.ts
│   └── ...
└── utils/          # Utilities (cache, rate-limit, quality)
    ├── confidence-scorer.ts  # Quality confidence scoring
    └── quality/              # Quality validation modules
```

## Advanced Configuration

<details>
<summary>Complete Configuration Reference</summary>

### Full Options

```javascript
/**
 * Localization Tool Configuration
 * Version: 2.1.0
 *
 * This configuration file controls all aspects of the localization tool
 * including API providers, performance settings, and quality controls.
 */

export default {
	// ===== BASIC CONFIGURATION =====
	version: "2.1.0", // Configuration version
	localesDir: "./locales", // Directory where locale JSON files are stored
	source: "en", // Source language code (ISO 639-1)
	targets: ["tr", "de", "es", "fr", "hi", "ja", "pl", "ru", "th", "uk", "vi", "yo", "zh"],

	// ===== API PROVIDER CONFIGURATION =====
	apiProvider: "openai", // Primary provider: openai, dashscope, deepseek, gemini, xai
	useFallback: true, // Enable automatic fallback to other providers
	fallbackOrder: ["openai", "dashscope", "deepseek", "gemini", "xai"], // Provider fallback chain

	// Individual provider configurations
	apiConfig: {
		deepseek: {
			model: "deepseek-chat", // Model name
			temperature: 0.1, // Creativity level (0.0-1.0)
			maxTokens: 2000, // Maximum tokens per request
		},
		openai: {
			model: "gpt-4o", // Latest optimized model
			temperature: 0.3,
			maxTokens: 2000,
		},
		gemini: {
			model: "gemini-2.0-flash-exp", // Latest Gemini model
			temperature: 0.3,
			maxTokens: 2000,
		},
		dashscope: {
			model: "qwen-plus",
			temperature: 0.3,
			maxTokens: 2000,
		},
		xai: {
			model: "grok-4",
			temperature: 0.3,
			maxTokens: 2000,
		},
	},

	// ===== PERFORMANCE OPTIMIZATION =====
	concurrencyLimit: 1, // Maximum parallel translations (optimized for stability)
	cacheEnabled: true, // Enable translation caching
	cacheTTL: 24 * 60 * 60 * 1000, // Cache time-to-live (24 hours)
	cacheSize: 2000, // Maximum cached items
	updateAgeOnGet: true, // Update cache age when accessed (LRU behavior)
	allowStaleCache: true, // Allow returning stale cache while refreshing
	staleWhileRevalidate: true, // Serve stale content while revalidating in background

	// Progress Tracker Options
	progressOptions: {
		logToConsole: true, // Show progress in console
		logFrequency: 1, // Update frequency (every N items)
	},

	// Rate Limiter Configuration (Speed Optimized)
	rateLimiter: {
		enabled: true,
		providerLimits: {
			openai: { rpm: 1000, concurrency: 15 }, // Aggressive limits for OpenAI
			deepseek: { rpm: 200, concurrency: 8 },
			gemini: { rpm: 500, concurrency: 12 }, // High-performance settings
			dashscope: { rpm: 200, concurrency: 8 },
			xai: { rpm: 300, concurrency: 10 },
		},
		queueStrategy: "fifo", // First-in-first-out for maximum speed
		adaptiveThrottling: false, // Disabled for consistent high performance
		queueTimeout: 10000, // Fast timeout (10 seconds)
	},

	// ===== ERROR HANDLING & RELIABILITY =====
	retryOptions: {
		maxRetries: 2, // Global retry attempts
		initialDelay: 1000, // Initial delay before retry (ms)
		maxDelay: 10000, // Maximum delay cap (ms)
		jitter: true, // Add randomization to retry delays
		retryableErrors: ["rate_limit", "timeout", "network", "server", "unknown"],
		perProviderRetry: {
			dashscope: { maxRetries: 3 }, // Provider-specific retry settings
			openai: { maxRetries: 2 },
		},
	},

	// ===== CONTEXT-AWARE TRANSLATION =====
	context: {
		enabled: true, // Enable context detection
		useAI: true, // Use AI for context analysis
		aiProvider: "openai", // AI provider for context analysis
		minTextLength: 50, // Minimum text length for AI analysis
		allowNewCategories: true, // Allow AI to suggest new categories
		debug: false, // Enable detailed context analysis logs

		// AI Analysis Configuration
		analysisOptions: {
			model: "gpt-4o", // OpenAI model for context analysis
			temperature: 0.2, // Lower temperature for consistent analysis
			maxTokens: 1000, // Tokens for analysis
		},

		// Detection Thresholds
		detection: {
			threshold: 2, // Minimum keyword matches for category
			minConfidence: 0.6, // Minimum confidence score (0.0-1.0)
		},

		// Content Categories with Keywords and Prompts
		categories: {
			technical: {
				keywords: [
					"API",
					"backend",
					"database",
					"server",
					"endpoint",
					"function",
					"method",
					"class",
					"object",
					"variable",
				],
				prompt: "Preserve technical terms and variable names",
				weight: 1.3,
			},
			defi: {
				keywords: [
					"DeFi",
					"staking",
					"yield",
					"liquidity",
					"token",
					"blockchain",
					"crypto",
					"wallet",
					"smart contract",
				],
				prompt: "Keep DeFi terms in English",
				weight: 1.2,
			},
			marketing: {
				keywords: [
					"brand",
					"campaign",
					"customer",
					"audience",
					"promotion",
					"value",
					"benefit",
					"feature",
				],
				prompt: "Use persuasive and engaging language appropriate for marketing content",
				weight: 1.1,
			},
			legal: {
				keywords: [
					"terms",
					"conditions",
					"privacy",
					"policy",
					"agreement",
					"compliance",
					"regulation",
					"law",
				],
				prompt: "Maintain formal tone and precise legal terminology",
				weight: 1.4,
			},
			ui: {
				keywords: [
					"button",
					"click",
					"menu",
					"screen",
					"page",
					"view",
					"interface",
					"select",
					"tap",
				],
				prompt: "Keep UI terms consistent and clear, maintain proper formatting for UI elements",
				weight: 1.2,
			},
		},

		// Fallback for unmatched content
		fallback: {
			category: "general",
			prompt: "Provide a natural translation",
		},
	},

	// ===== QUALITY ASSURANCE =====
	qualityChecks: {
		enabled: true, // Enable quality validation
		rules: {
			placeholderConsistency: true, // Validate {{placeholders}}
			htmlTagsConsistency: true, // Preserve <HTML> tags
			punctuationCheck: true, // Check punctuation consistency
			quoteBalanceCheck: true, // Detect and fix unbalanced quotes
			lengthValidation: true, // Validate translation length
			sanitizeOutput: true, // Clean AI artifacts
			markdownPreservation: true, // Preserve markdown formatting
			specialCharacters: true, // Maintain special characters
			codeBlockPreservation: true, // Preserve code blocks
		},
		autoFix: true, // Automatically fix detected issues
	},

	// ===== STYLE GUIDE =====
	styleGuide: {
		formality: "neutral", // Options: formal, neutral, informal
		toneOfVoice: "professional", // Options: professional, friendly, casual, technical
		conventions: {
			useOxfordComma: true, // Use Oxford comma in lists
			useSentenceCase: true, // Use sentence case for headings
		},
	},

	// ===== LENGTH CONTROL =====
	lengthControl: {
		mode: "smart", // Options: strict, flexible, exact, relaxed, smart
		rules: {
			strict: 0.1, // 10% deviation allowed
			flexible: 0.3, // 30% deviation allowed
			exact: 0.05, // 5% deviation allowed
			relaxed: 0.5, // 50% deviation allowed
			smart: {
				default: 0.15, // Default tolerance
				// Language-specific rules
				byLanguage: {
					ja: { max: 0.35, min: -0.2 }, // Japanese: +35% / -20%
					zh: { max: 0.35, min: -0.2 }, // Chinese: +35% / -20%
					th: { max: 0.3, min: -0.15 }, // Thai: +30% / -15%
					vi: { max: 0.25, min: -0.15 }, // Vietnamese: +25% / -15%
					hi: { max: 0.2, min: -0.1 }, // Hindi: +20% / -10%
					ru: { max: 0.25, min: -0.15 }, // Russian: +25% / -15%
					uk: { max: 0.25, min: -0.15 }, // Ukrainian: +25% / -15%
					pl: { max: 0.2, min: -0.1 }, // Polish: +20% / -10%
					de: { max: 0.15, min: -0.1 }, // German: +15% / -10%
					fr: { max: 0.15, min: -0.1 }, // French: +15% / -10%
					es: { max: 0.15, min: -0.1 }, // Spanish: +15% / -10%
					tr: { max: 0.15, min: -0.1 }, // Turkish: +15% / -10%
				},
				// Context-specific rules
				byContext: {
					technical: { max: 0.2, min: -0.1 }, // Technical: +20% / -10%
					marketing: { max: 0.3, min: -0.15 }, // Marketing: +30% / -15%
					legal: { max: 0.1, min: -0.05 }, // Legal: +10% / -5%
					general: { max: 0.15, min: -0.1 }, // General: +15% / -10%
				},
			},
		},
	},

	// ===== LOGGING & DIAGNOSTICS =====
	logging: {
		verbose: false, // Disable verbose logging for cleaner output
		diagnosticsLevel: "minimal", // Options: minimal, normal, detailed
		outputFormat: "pretty", // Options: pretty, json, minimal
		saveErrorLogs: true, // Save error logs to file
		logDirectory: "./logs", // Directory for log files
		includeTimestamps: true, // Include timestamps in logs
		logRotation: {
			enabled: true, // Enable log rotation
			maxFiles: 5, // Maximum log files to keep
			maxSize: "10MB", // Maximum log file size
		},
	},

	// ===== FILE OPERATIONS =====
	fileOperations: {
		backupFiles: true, // Create backups of existing files before overwriting
		backupDir: "./backups", // Directory for backup files
		atomic: true, // Use atomic writes to prevent corruption
		createMissingDirs: true, // Automatically create missing directories
	},

	// ===== SYNCHRONIZATION =====
	syncOptions: {
		enabled: true, // Enable sync features
		removeDeletedKeys: true, // Remove deleted keys from target files
		retranslateModified: true, // Re-translate modified keys
		stateTracking: {
			enabled: true, // Enable state tracking for change detection
			stateFileName: "localization.state.json", // State file name
			stateDir: ".localize-cache", // Directory for state files
		},
	},

	// ===== ADVANCED SETTINGS =====
	advanced: {
		timeoutMs: 15000, // Request timeout (15 seconds)
		maxKeyLength: 10000, // Maximum key length for translation
		maxBatchSize: 30, // Maximum batch size for operations
		autoOptimize: true, // Auto-optimize settings for hardware
		debug: false, // Enable debug mode
	},

	// ===== QUALITY CONFIDENCE SCORING =====
	confidenceScoring: {
		enabled: false, // Enable confidence scoring for translations
		minConfidence: 0.7, // Minimum confidence threshold (0-1)
		saveReviewQueue: false, // Save low-confidence items for manual review
		autoApproveThreshold: 0.9, // Auto-approve translations above this score
		reviewThreshold: 0.7, // Flag for review below this score
		rejectThreshold: 0.5, // Auto-reject translations below this score
	},
};
```

### Key Configuration Categories

| Category        | Key Options                           | Description                             |
| --------------- | ------------------------------------- | --------------------------------------- |
| **Performance** | `concurrencyLimit`, `rateLimiter`     | Parallel processing and rate limiting   |
| **AI Context**  | `context.useAI`, `context.categories` | AI-powered content categorization       |
| **Quality**     | `qualityChecks`, `lengthControl`      | Validation rules and auto-fixing        |
| **Sync**        | `syncOptions.removeDeletedKeys`       | Smart synchronization behavior          |
| **Providers**   | `apiConfig`, `fallbackOrder`          | AI provider settings and fallback chain |

</details>

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.

---

[![GitHub](https://img.shields.io/badge/GitHub-ahmetenesdur-blue?logo=github)](https://github.com/ahmetenesdur)
