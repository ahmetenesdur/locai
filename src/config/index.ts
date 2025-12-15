import { loadConfig as c12LoadConfig, ConfigLayer } from "c12";
import { OrchestratorOptions } from "../core/orchestrator.js";

export interface LocalizeConfig extends Omit<Partial<OrchestratorOptions>, "context"> {
	/**
	 * Source language code (e.g. 'en')
	 */
	source?: string;

	/**
	 * Target language codes (e.g. ['tr', 'es'])
	 */
	targets?: string[];

	/**
	 * Directory where localization files are stored
	 * @default "./locales"
	 */
	localesDir?: string;

	/**
	 * API Provider to use for translations
	 * @default "openai"
	 */
	apiProvider?: string;

	/**
	 * Enable debug mode with verbose logging
	 * @default false
	 */
	debug?: boolean;

	/**
	 * Force update of existing translations
	 * @default false
	 */
	forceUpdate?: boolean;

	/**
	 * Synchronization options
	 */
	syncOptions?: {
		enabled?: boolean;
		removeDeletedKeys?: boolean;
		retranslateModified?: boolean;
		stateTracking?: {
			enabled?: boolean;
			stateFileName?: string;
			stateDir?: string;
		};
	};

	/**
	 * Concurrency limit for parallel translations
	 * @default 5
	 */
	concurrencyLimit?: number;

	/**
	 * Save low-confidence items for manual review
	 * @default false
	 */
	saveReviewQueue?: boolean;

	/**
	 * Minimum confidence threshold (0-1)
	 */
	minConfidence?: number;

	/**
	 * File extensions to process
	 */
	fileExtensions?: string[];

	// Legacy options support
	useAi?: boolean;
	contextProvider?: string;
	contextThreshold?: number;
	contextConfidence?: number;
	length?: string;
	autoOptimize?: boolean;
	stats?: boolean;
	maxRetries?: number;
	initialDelay?: number;
	maxDelay?: number;
	contextDebug?: boolean;
	minTextLength?: number;
	allowNewCategories?: boolean;
	provider?: string;
	concurrency?: number | string;
	noCache?: boolean;
	force?: boolean;
	verbose?: boolean;
	version?: string;

	// Overrides for better typing or legacy support
	rateLimiter?: {
		enabled?: boolean;
		queueStrategy?: string;
		queueTimeout?: number;
		adaptiveThrottling?: boolean;
		providerLimits?: any;
	};

	context?: {
		enabled?: boolean;
		useAI?: boolean;
		aiProvider?: string;
		minTextLength?: number;
		allowNewCategories?: boolean;
		debug?: boolean;
		analysisOptions?: {
			model?: string;
			temperature?: number;
			maxTokens?: number;
			cacheAnalysis?: boolean;
		};
		detection?: {
			threshold?: number;
			minConfidence?: number;
		};
		categories?: any;
		fallback?: any;
	};

	qualityChecks?: {
		enabled?: boolean;
		rules?: any;
		autoFix?: boolean;
	};

	// Command specific
	command?: string;
	fixLength?: boolean;
	showDetailedStats?: boolean;
}

/**
 * Type-safe configuration helper
 */
export function defineConfig(config: LocalizeConfig): LocalizeConfig {
	return config;
}

/**
 * Load configuration using c12
 */
export async function loadConfig(cwd: string = process.cwd()) {
	const { config, configFile, layers } = await c12LoadConfig<LocalizeConfig>({
		name: "localize",
		configFile: "localize.config",
		rcFile: ".localizerc",
		dotenv: true,
		cwd,
		defaults: {
			source: "en",
			targets: [],
			localesDir: "./locales",
			concurrencyLimit: 5,
			cacheEnabled: true,
			retryOptions: {
				maxRetries: 2,
				initialDelay: 1000,
				maxDelay: 10000,
			},
			context: {
				enabled: true,
				detection: { threshold: 2, minConfidence: 0.6 },
				useAI: false,
				minTextLength: 50,
				categories: {},
				fallback: {
					category: "general",
					prompt: "Provide a natural translation",
				},
			},
			apiConfig: {},
			fileOperations: {},
		},
	});

	return {
		config: config || {},
		configFile,
		layers,
	};
}
