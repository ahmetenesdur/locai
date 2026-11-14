/**
 * Localization Tool Configuration (the repository's own example).
 * Controls API providers, performance settings, and quality controls.
 */

import { defineConfig } from "./src/config/index.js";

export default defineConfig({
	localesDir: "./locales", // Directory where locale JSON files are stored. Supports flat (en.json) or nested (en/translation.json; the file must be named translation.json) structures.
	source: "en",
	targets: ["tr", "de", "es", "fr", "hi", "ja", "pl", "ru", "th", "uk", "vi", "yo", "zh"],

	// Deep Context (Source Code Analysis)
	// Scans source code for context (component name, comments, props)
	deepContext: true,

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

	// Vector Memory (optional, off unless enabled: true)
	// Reuses stored translations of similar strings. Needs OPENAI_API_KEY and costs one
	// embedding request per new string.
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
		queueTimeout: 120000, // ms; config validation accepts 1000-120000
	},

	// Error Handling
	retryOptions: {
		maxRetries: 2,
		initialDelay: 1000,
		maxDelay: 60000,
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
		// No built-in categories: only the ones defined here are used
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
		fallback: {
			category: "general",
			prompt: "Provide a natural translation",
		},
	},

	// Quality Checks
	// Automated validation and fixing to ensure translation quality
	qualityChecks: {
		enabled: true, // Enable quality checks
		rules: {
			placeholderConsistency: true, // Check placeholders
			htmlTagsConsistency: true, // Check HTML tags
			punctuationCheck: true, // Check punctuation
			quoteBalanceCheck: true, // Check quote balance (prevents missing quotes that cause JSON parse errors)
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
		toneProvider: "openai", // Provider for tone verification (e.g., openai, gemini)
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
					th: { max: 0.3, min: -0.15 },
					vi: { max: 0.25, min: -0.15 },
					hi: { max: 0.2, min: -0.1 },
					ru: { max: 0.25, min: -0.15 },
					uk: { max: 0.25, min: -0.15 },
					pl: { max: 0.2, min: -0.1 },
					de: { max: 0.15, min: -0.1 },
					fr: { max: 0.15, min: -0.1 },
					es: { max: 0.15, min: -0.1 },
					tr: { max: 0.15, min: -0.1 },
				},
				byContext: {
					technical: { max: 0.2, min: -0.1 },
					marketing: { max: 0.3, min: -0.15 },
					legal: { max: 0.1, min: -0.05 },
					general: { max: 0.15, min: -0.1 },
				},
			},
		},
	},

	// Progress Tracker Options
	progressOptions: {
		logToConsole: true, // Show progress in console
		logFrequency: 1, // Update frequency (every N items)
	},

	// Logging
	logging: {
		verbose: false,
		saveErrorLogs: true,
		logDirectory: "./logs",
		logRotation: {
			enabled: true,
		},
	},

	// File Operations
	fileOperations: {
		// Locale files are always read and written as JSON. `format` and `fileStructure`
		// are accepted for compatibility but have no effect; the layout follows the source file.

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
			enabled: true, // Enable state tracking for change detection
			stateFileName: "localization.state.json", // State file name
			stateDir: ".localize-cache", // Directory for state files
		},
	},

	// Advanced Settings
	advanced: {
		timeoutMs: 60000,
		maxKeyLength: 10000,
		maxBatchSize: 30,
		autoOptimize: true,
		debug: false,
	},

	// Quality Confidence Scoring
	confidenceScoring: {
		enabled: false, // Enable confidence scoring for translations
		minConfidence: 0.7, // Minimum confidence threshold (0-1)
		saveReviewQueue: false, // Save low-confidence items for manual review
		autoApproveThreshold: 0.9, // Auto-approve translations above this score
		reviewThreshold: 0.7, // Flag for review below this score
		rejectThreshold: 0.5, // Auto-reject translations below this score
	},

	// Glossary/Terminology Management
	// Ensures consistent brand terminology across all translations
	glossary: {
		enabled: true,
		caseSensitive: false, // Match terms regardless of case
		preserveFormatting: true, // Maintain capitalization from source
		glossary: {
			// Simple format: term stays the same in all languages
			API: "API",
			SDK: "SDK",
			OAuth: "OAuth",
			JSON: "JSON",
			REST: "REST",
			GraphQL: "GraphQL",
			WebSocket: "WebSocket",

			// Advanced format: specify case sensitivity and other options
			DeFi: {
				translation: "DeFi",
				caseSensitive: true, // Must match exact case
				// Optional: only apply for these target languages (whole codes, case-insensitive;
				// "zh" does not match "zh-CN"). Omitted or empty = every target language.
				// languages: ["de", "pt-BR"],
			},
			NFT: {
				translation: "NFT",
				caseSensitive: true,
			},

			// Language-specific translations
			Dashboard: {
				en: "Dashboard",
				tr: "Kontrol Paneli",
				de: "Dashboard",
				es: "Panel de Control",
				fr: "Tableau de Bord",
				ja: "ダッシュボード",
				zh: "仪表板",
			},

			// Brand names (always keep in English)
			// Add your product/company names here
			// Example: "YourProduct": "YourProduct",
		},
	},
});
