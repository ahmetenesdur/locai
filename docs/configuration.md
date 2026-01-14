# Configuration Guide

Locai follows a "Zero-Config" philosophy but offers deep customization when you need it. It uses [`c12`](https://github.com/unjs/c12) to load configuration, supporting `.js`, `.ts`, and `.json` extensions.

## Supported Files

- `localize.config.ts` (Recommended)
- `localize.config.js`
- `.localizerc`

## Supported Directory Structures

Locai automatically detects your project's locale structure. No configuration needed.

### 1. Flat Structure (Standard)

Simplest format, one JSON file per language.

```
locales/
├── en.json
├── tr.json
└── es.json
```

### 2. Nested Structure

Common in larger projects (like `react-i18next` setups).

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
	targets: ["tr", "es", "de"], // Changed from ["tr", "es", "de", "fr"]

	// Scans source code for rich context (enabled by default)
	deepContext: true,

	// API Provider
	apiProvider: "openai",
	localesDir: "./locales", // Tool auto-detects this usually
};
```

### TypeScript (Recommended)

Provides full type safety and autocomplete.

```typescript
// localize.config.ts
import { defineConfig } from "locai";

export default defineConfig({
	source: "en",
	targets: ["tr"],
	apiProvider: "openai",
});
```

## Complete Configuration Reference

Below is the full list of available options, including advanced performance, quality, and context settings.

> **Tip:** For a living example, check out the [`localize.config.ts`](../localize.config.ts) file in the project root. It contains every available option with detailed comments.

```typescript
export default defineConfig({
	// ===== BASIC SETTINGS =====
	version: "2.6.0",
	localesDir: "./locales", // Directory where locale JSON files are stored
	source: "en", // Source language code (ISO 639-1)
	targets: ["tr", "de", "es"], // Target language codes

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
	allowStaleCache: true, // Allow returning stale cache while refreshing
	staleWhileRevalidate: true, // Serve stale content while revalidating in background

	// Vector Memory (Infinite Memory)
	// Semantic caching using embeddings to find similar translations
	vectorMemory: {
		enabled: true,
		similarityThreshold: 0.85, // Minimum similarity to use as context
		exactMatchThreshold: 0.98, // Minimum similarity to use directly as translation
		vectorDbPath: "./.localize-cache/vector-memory",
		embeddingProvider: "openai", // Provider for generating embeddings
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
		useAI: true,
		aiProvider: "openai",
		minTextLength: 200,
		allowNewCategories: true,
		debug: false,
		analysisOptions: {
			model: "gpt-4o",
			temperature: 0.2,
			maxTokens: 1000,
		},
		detection: {
			threshold: 2,
			minConfidence: 0.6,
		},
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
			API: "API",
			SDK: "SDK",
			Dashboard: {
				en: "Dashboard",
				tr: "Kontrol Paneli",
			},
		},
	},
});
```

> **Note:** This is a partial example showing common configuration options. For the complete configuration with all available options and their default values, see the [`localize.config.ts`](../localize.config.ts) file in the project root.

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

### Cache Issues

If translations aren't updating:

- Run with `--force` to ignore cache: `locai translate --force`.
- Delete the `.localize-cache` folder manually.

### TypeScript Config Errors

If `localize.config.ts` isn't loading:

- Ensure `ts-node` or `jiti` is installed/working (Locai handles this internally usually).
- Switch to `localize.config.js` if ESM issues persist.
