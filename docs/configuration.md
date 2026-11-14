# Configuration Guide

Locai runs without a config file (pass `--source` and `--targets`), or reads its settings from a config file in the directory you run it from. Command-line options override the config file.

## Supported Files

Configuration is loaded with [`c12`](https://github.com/unjs/c12), which looks for `localize.config` with one of these extensions:

- `localize.config.ts` (recommended; loaded with `jiti`, which is bundled, so no extra setup is needed)
- `localize.config.js`, `.mjs`, `.cjs`, `.mts`, `.cts`
- `localize.config.json`, `.jsonc`, `.json5`, `.yaml`, `.yml`, `.toml`

## Locale Files

`translate` and `fix` read and write JSON only. The source file is looked up in `localesDir` (default `./locales`) in this order:

1. `<localesDir>/<source>/translation.json`
2. `<localesDir>/<source>.json`
3. Any file in `localesDir` whose name starts with `<source>.`, or a `<localesDir>/<source>/` directory that contains `translation.json`

Target files are written in the same layout as the source file: `<localesDir>/<target>/translation.json` for the nested layout, `<target>.json` next to the source file for the flat layout. Locai does not search other directories; set `localesDir` (or pass `--localesDir`) if your files are elsewhere, for example `public/locales` or `messages`.

The codebase also contains adapters for YAML, PO, `.properties`, Android XML and iOS `.strings` files, but `translate` and `fix` do not use them.

### 1. Flat Structure (Standard)

Simplest format, one JSON file per language.

```
locales/
├── en.json
├── tr.json
└── es.json
```

### 2. Nested Structure

Common in `react-i18next` setups. The file in each language directory must be named `translation.json`.

```
locales/
├── en/
│   └── translation.json
├── tr/
│   └── translation.json
└── es/
    └── translation.json
```

## Basic Configuration

### JavaScript/JSON

Suitable for simple projects or `npx` usage.

```javascript
// localize.config.js
export default {
	source: "en",
	targets: ["tr", "es", "de"],

	// Scans source code for rich context (enabled by default)
	deepContext: true,

	// API Provider
	apiProvider: "openai",
	localesDir: "./locales", // Default: "./locales"
};
```

### TypeScript (Recommended)

Provides full type safety and autocomplete.

```typescript
// localize.config.ts
import { defineConfig } from "locai/config";

export default defineConfig({
	source: "en",
	targets: ["tr"],
	apiProvider: "openai",
});
```

## Configuration Reference

Below is an example with most options, including performance, quality, and context settings. The values are examples, not defaults; where a default matters it is noted in a comment.

> **Tip:** The [`localize.config.ts`](../localize.config.ts) file in the project root is the repository's own config. It uses the same options with comments.

```typescript
export default defineConfig({
	// ===== BASIC SETTINGS =====
	localesDir: "./locales", // Directory where locale JSON files are stored
	source: "en", // Source language (BCP 47 tag, e.g. "en", "pt-BR", "zh-Hant")
	targets: ["tr", "de", "es"], // Target language tags; also used as output file names (e.g. pt-BR.json)

	// Deep Context (Source Code Analysis)
	deepContext: true, // Scans source code for context (component name, comments, props)

	// API Provider Configuration
	apiProvider: "openai",
	useFallback: true,
	fallbackOrder: ["openai", "anthropic", "dashscope", "deepseek", "gemini", "xai"],
	apiConfig: {
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
		openai: {
			model: "gpt-4o",
			temperature: 0.3,
			maxTokens: 2000,
		},
		deepseek: {
			model: "deepseek-chat",
			temperature: 0.1,
			maxTokens: 2000,
		},
		gemini: {
			model: "gemini-3-flash",
			temperature: 0.3,
			maxTokens: 2000,
		},
		anthropic: {
			model: "claude-haiku-4-5-20251001",
			temperature: 0.3,
			maxTokens: 4096,
		},
	},

	// Performance Optimization
	concurrencyLimit: 1,
	cacheEnabled: true,
	cacheTTL: 24 * 60 * 60 * 1000,
	cacheSize: 2000,
	updateAgeOnGet: true, // Update cache age when accessed (LRU behavior)
	// Expired entries are translated again. `allowStaleCache` and `staleWhileRevalidate`
	// are still accepted for compatibility but have no effect.

	// Vector Memory (optional, off unless enabled: true)
	// Reuses stored translations of similar strings. Needs OPENAI_API_KEY and costs one
	// embedding request per new string. Only "openai" embeddings are supported.
	vectorMemory: {
		enabled: true,
		similarityThreshold: 0.85, // Minimum similarity to use as context
		exactMatchThreshold: 0.98, // Minimum similarity to use directly as translation
		vectorDbPath: "./.localize-cache/vector-memory",
		embeddingProvider: "openai", // Only "openai" is supported
		embeddingModel: "text-embedding-3-small",
	},

	// Rate Limiter Configuration
	rateLimiter: {
		enabled: true,
		providerLimits: {
			dashscope: { rpm: 200, concurrency: 8 },
			xai: { rpm: 300, concurrency: 10 },
			openai: { rpm: 1000, concurrency: 15 },
			deepseek: { rpm: 200, concurrency: 8 },
			gemini: { rpm: 500, concurrency: 12 },
			anthropic: { rpm: 50, concurrency: 5 },
		},
		queueStrategy: "fifo",
		adaptiveThrottling: false,
		queueTimeout: 10000,
	},

	// Error Handling
	retryOptions: {
		maxRetries: 2,
		initialDelay: 1000,
		maxDelay: 10000,
		retryableErrors: ["rate_limit", "timeout", "network", "server", "unknown"],
		perProviderRetry: {
			dashscope: { maxRetries: 3 },
			openai: { maxRetries: 2 },
			anthropic: { maxRetries: 2 },
		},
	},

	// Translation Quality and Context
	context: {
		enabled: true,
		useAI: true, // Default: false. AI classifies strings >= minTextLength when the keyword match is weak (extra API calls)
		aiProvider: "openai",
		minTextLength: 200, // Default: 50
		allowNewCategories: true, // Let AI analysis suggest categories that are not defined below
		debug: false,
		analysisOptions: {
			model: "gpt-4o",
			temperature: 0.2,
			maxTokens: 1000,
		},
		detection: {
			threshold: 2, // Keyword matches needed for a category
			minConfidence: 0.6, // Share of the total score the best category needs
		},
		// No built-in categories: only the ones you define here are used
		categories: {
			technical: {
				keywords: ["API", "backend", "database", "server", "endpoint"],
				prompt: "Preserve technical terms and variable names",
				weight: 1.3,
			},
			marketing: {
				keywords: ["brand", "campaign", "customer", "audience"],
				prompt: "Use persuasive and engaging language appropriate for marketing content",
				weight: 1.1,
			},
		},
	},

	// Quality Checks
	qualityChecks: {
		enabled: true, // Enable quality checks
		rules: {
			placeholderConsistency: true, // Check placeholders
			htmlTagsConsistency: true, // Check HTML tags
			punctuationCheck: true, // Check punctuation
			quoteBalanceCheck: true, // Check quote balance
			lengthValidation: true, // Check text length
			sanitizeOutput: true, // Clean output text
			markdownPreservation: true, // Preserve markdown
			specialCharacters: true, // Maintain special characters
			codeBlockPreservation: true, // Preserve code blocks
		},
		autoFix: true, // Auto-fix common issues
	},

	// Style Guide
	styleGuide: {
		formality: "neutral", // formal, neutral, informal
		toneOfVoice: "professional", // professional, friendly, casual, technical
		toneProvider: "openai", // Provider for tone verification
		enforceTone: true, // Validate tone with AI (Smart Stylist)
		analysisOptions: {
			model: "gpt-4o",
			temperature: 0.1,
		},
		conventions: {
			useOxfordComma: true, // Use Oxford comma in lists
			useSentenceCase: true, // Use sentence case for headings
		},
	},

	// Length Control
	lengthControl: {
		mode: "smart", // strict, flexible, exact, relaxed, smart
		rules: {
			strict: 0.1, // 10% deviation
			flexible: 0.3, // 30% deviation
			exact: 0.05, // 5% deviation
			relaxed: 0.5, // 50% deviation
			smart: {
				default: 0.15, // Default tolerance
				byLanguage: {
					ja: { max: 0.35, min: -0.2 },
					zh: { max: 0.35, min: -0.2 },
					// ... other languages
				},
				byContext: {
					technical: { max: 0.2, min: -0.1 },
					marketing: { max: 0.3, min: -0.15 },
					// ... other contexts
				},
			},
		},
	},

	// Loggging & Progress
	progressOptions: {
		logToConsole: true,
		logFrequency: 1,
	},
	logging: {
		verbose: false,
		saveErrorLogs: true,
		logDirectory: "./logs",
		logRotation: { enabled: true },
	},

	// File Operations
	fileOperations: {
		backupFiles: false,
		backupDir: "./.backups",
		atomic: true,
		createMissingDirs: true,
	},

	// Synchronization
	syncOptions: {
		enabled: true,
		removeDeletedKeys: true,
		retranslateModified: true,
		stateTracking: {
			enabled: true,
			stateFileName: "localization.state.json",
			stateDir: ".localize-cache",
		},
	},

	// Advanced Settings
	advanced: {
		timeoutMs: 15000,
		maxKeyLength: 10000,
		maxBatchSize: 30,
		autoOptimize: true,
		debug: false,
	},

	// Confidence Scoring
	confidenceScoring: {
		enabled: false,
		minConfidence: 0.7,
		saveReviewQueue: false,
		autoApproveThreshold: 0.9,
		reviewThreshold: 0.7,
		rejectThreshold: 0.5,
	},

	// Glossary
	glossary: {
		enabled: true,
		caseSensitive: false,
		preserveFormatting: true,
		glossary: {
			// Simple: the same replacement for every target language
			API: "API",
			SDK: "SDK",
			// Advanced: `languages` limits the entry to these target languages
			// (whole codes, case-insensitive: "zh" does not match "zh-CN").
			// Omit it or leave it empty to apply the entry to every target language.
			NFT: {
				translation: "NFT",
				caseSensitive: true,
				languages: ["de", "pt-BR"],
			},
			// Per-language: only applied for the target languages listed as keys
			Dashboard: {
				en: "Dashboard",
				tr: "Kontrol Paneli",
			},
		},
	},
});
```

> **Note:** This is a partial example. The values are not defaults. See [`localize.config.ts`](../localize.config.ts) in the project root for the repository's own config.

## Troubleshooting

### API Rate Limits (429 Errors)

If you see `Rate limit exceeded` errors:

1.  **Reduce Concurrency**: Set `concurrencyLimit: 1` in your config.
2.  **Enable Fallback**: Set `useFallback: true` to switch to another provider automatically.
3.  **Check Plan**: Ensure your API provider account has sufficient credits.

### "Validation Failed" Errors

Locai validates translations before saving.

- **Placeholders**: Ensure `{{variable}}` exists in the translation.
- **HTML**: Check for broken tags like `</b>` without `<b>`.
- **Fix**: Run `locai fix` to attempt auto-repair.

### Translations Not Updating

Locai skips keys that already exist in the target file unless their source text changed since the last run (see [Smart Synchronization](./concepts.md#2-smart-synchronization)).

- Run with `--force` to re-translate keys that already exist in the target files: `locai translate --force`.
- The translation cache (`cacheEnabled`) is kept in memory for the current run only; `--no-cache` turns it off. It is not stored between runs.
- `.localize-cache/` holds the change-tracking state file and, if enabled, the vector memory database. Deleting it resets both; it does not force re-translation of existing keys.

### TypeScript Config Errors

If `localize.config.ts` isn't loading:

- TypeScript configs are loaded with `jiti`, which is bundled with Locai; you do not need `ts-node` or `tsx`.
- Run `locai validate-config` to see whether the values pass validation.
- If the file still fails to load, try a plain `localize.config.js` or `localize.config.json`.
