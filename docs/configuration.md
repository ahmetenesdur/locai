# Configuration Guide

Locai follows a "Zero-Config" philosophy but offers deep customization when you need it. It uses [`c12`](https://github.com/unjs/c12) to load configuration, supporting `.js`, `.ts`, and `.json` extensions.

## Supported Files

- `localize.config.ts` (Recommended)
- `localize.config.js`
- `.localizerc`

## Basic Configuration

### JavaScript/JSON

Suitable for simple projects or `npx` usage.

```javascript
// localize.config.js
export default {
	source: "en",
	targets: ["tr", "es", "de", "fr"],
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
	version: "2.1.3",
	localesDir: "./locales", // Directory where locale JSON files are stored
	source: "en", // Source language code (ISO 639-1)
	targets: ["tr", "de", "es"], // Target language codes

	// ===== API PROVIDERS =====
	apiProvider: "openai", // 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'xai' | 'dashscope'
	useFallback: true, // Automatically switch providers if one fails
	fallbackOrder: ["openai", "anthropic", "dashscope", "deepseek", "gemini", "xai"], // Priority order

	// Provider-specific configs (overrides defaults)
	apiConfig: {
		openai: {
			model: "gpt-5.2-chat-latest",
			temperature: 0.3,
			maxTokens: 2000,
		},
		gemini: {
			model: "gemini-3-flash",
		},
		anthropic: {
			model: "claude-haiku-4-5-20251001",
		},
		// ... (see docs/providers.md for full list)
	},

	// ===== PERFORMANCE & CACHING =====
	concurrencyLimit: 5, // Max parallel requests. Lower if hitting rate limits.
	cacheEnabled: true, // Enable caching to save costs
	cacheTTL: 24 * 60 * 60 * 1000, // Cache validity (24 hours)

	// Rate Limiter (Speed vs Stability)
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
	},

	// ===== QUALITY & CONTEXT =====

	// Context Awareness (Smart Translation)
	context: {
		enabled: true,
		useAI: true, // Use AI to analyze context (Technical, Marketing, etc.)
		minTextLength: 200, // Only analyze longer texts to save tokens
		analysisOptions: {
			model: "gpt-5.2-chat-latest", // Use a smart model for analysis
		},
		categories: {
			// Custom categories
			marketing: {
				keywords: ["brand", "buy", "sale"],
				prompt: "Use persuasive, engaging language.",
			},
		},
	},

	// Quality Assurance Checks
	qualityChecks: {
		enabled: true,
		autoFix: true, // Automatically fix simple issues
		rules: {
			placeholderConsistency: true, // Ensure {{name}} is preserved
			htmlTagsConsistency: true, // Ensure <b>tags</b> are preserved
			punctuationCheck: true, // Check punctuation
			quoteBalanceCheck: true, // Fix invalid JSON quotes
			lengthValidation: true, // Warn if translation is too long/short
			sanitizeOutput: true, // Clean output text
			markdownPreservation: true, // Preserve markdown
			specialCharacters: true, // Maintain special characters
			codeBlockPreservation: true, // Preserve code blocks
		},
	},

	// Style Guide & Tone
	styleGuide: {
		formality: "neutral", // 'formal' | 'informal' | 'neutral'
		toneOfVoice: "friendly", // 'professional' | 'friendly' | 'tech'
		enforceTone: true, // Use AI to audit tone
		conventions: {
			useOxfordComma: true,
			useSentenceCase: true,
		},
	},

	// ===== ADVANCED FEATURES =====

	// Infinite Memory (Vector Cache)
	vectorMemory: {
		enabled: true,
		similarityThreshold: 0.85, // 85% match triggers context reuse
		exactMatchThreshold: 0.98, // 98% match triggers direct reuse
	},

	// Glossary (Brand Protection)
	glossary: {
		enabled: true,
		glossary: {
			Locai: "Locai",
			API: "API",
			Cloud: {
				tr: "Bulut",
				es: "Nube",
			},
		},
	},

	// Synchronization Options
	syncOptions: {
		enabled: true,
		removeDeletedKeys: true, // Delete keys from targets if removed from source
		retranslateModified: true, // Detect content changes
	},

	// Manual Review
	saveReviewQueue: false, // Save low-confidence items for `locai review`
	confidenceScoring: {
		minConfidence: 0.7, // Flag translations below this score
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
