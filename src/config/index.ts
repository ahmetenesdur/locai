import { loadConfig as c12LoadConfig } from "c12";
import type { OrchestratorOptions, ProviderRetryOptions } from "../core/orchestrator.js";
import type { ContextConfig } from "../core/context-processor.js";
import type { ProviderConfig } from "../providers/base-provider.js";
import type { SyncOptions } from "../types/index.js";
import type { LoggerConfig } from "../utils/logger.js";

/** The `context` section as written in a config file; {@link loadConfig} fills in the rest. */
export interface ContextConfigInput extends Partial<Omit<ContextConfig, "detection" | "fallback">> {
	detection?: Partial<ContextConfig["detection"]>;
	fallback?: Partial<ContextConfig["fallback"]>;
}

/** The `fileOperations` configuration section. */
export interface FileOperationsConfig {
	/**
	 * File format to use (json, yaml, po, properties, etc.)
	 * @default "json"
	 */
	format?: "json" | "yaml" | "po" | "properties" | "arb" | "auto";

	/**
	 * File structure (flat, nested, namespaced)
	 * @default "flat"
	 */
	fileStructure?: "flat" | "nested" | "namespaced" | "auto";

	backupFiles?: boolean;
	backupDir?: string;
	atomic?: boolean;
	createMissingDirs?: boolean;
}

export interface LocalizeConfig extends Omit<
	Partial<OrchestratorOptions>,
	"context" | "sourceCodeAnalyzer"
> {
	/**
	 * Source language code (e.g. 'en')
	 */
	source?: string;

	/**
	 * Target language codes (e.g. ['tr', 'es'])
	 */
	targets?: string[];

	/**
	 * Deep Context (Source Code Analysis): find where each key is used in the `.ts`/`.tsx` files
	 * under `src/`, `app/` and `components/`, and add the file, component, comments, JSX props and
	 * a code snippet of that usage to the translation prompt.
	 * @default true
	 */
	deepContext?: boolean;

	/**
	 * Filter by file extensions (e.g. ['.json', '.arb'])
	 */
	fileExtensions?: string[];

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
	syncOptions?: SyncOptions;

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

	fileOperations?: FileOperationsConfig;
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

	logging?: LoggerConfig;

	context?: ContextConfigInput;

	// Command specific
	command?: string;
	fixLength?: boolean;
	showDetailedStats?: boolean;
}

/**
 * The configuration returned by {@link loadConfig}: the user's settings merged over the
 * defaults, so the defaulted settings are always present.
 */
export interface ResolvedLocalizeConfig extends LocalizeConfig {
	source: string;
	targets: string[];
	localesDir: string;
	concurrencyLimit: number;
	cacheEnabled: boolean;
	retryOptions: ProviderRetryOptions;
	context: ContextConfig;
	apiConfig: Record<string, ProviderConfig>;
	fileOperations: FileOperationsConfig;
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
			fileOperations: {
				format: "json",
				fileStructure: "flat",
			},
		} satisfies ResolvedLocalizeConfig,
	});

	return {
		// c12 merges the user's config over `defaults`, so the defaulted settings are always set.
		config: (config || {}) as ResolvedLocalizeConfig,
		configFile,
		layers,
	};
}

export const validateEnvironment = (config?: LocalizeConfig) => {
	const providerMap: Record<string, string> = {
		openai: "OPENAI_API_KEY",
		anthropic: "ANTHROPIC_API_KEY",
		gemini: "GEMINI_API_KEY",
		deepseek: "DEEPSEEK_API_KEY",
		xai: "XAI_API_KEY",
		dashscope: "DASHSCOPE_API_KEY",
	};

	// If a specific provider is configured, check its key
	if (config?.apiProvider && config.apiProvider !== "auto") {
		const requiredKey = providerMap[config.apiProvider];
		if (requiredKey && !process.env[requiredKey]) {
			console.warn(
				`\n\u26a0\ufe0f  Warning: ${requiredKey} is missing for provider '${config.apiProvider}'`
			);
			console.warn(`   Please add it to your .env file or environment variables.\n`);
		}
		return;
	}

	// If auto or no provider, check if ANY valid key exists
	const hasAnyKey = Object.values(providerMap).some((key) => process.env[key]);
	if (!hasAnyKey) {
		console.warn("\n\u26a0\ufe0f  Warning: No supported API keys found in environment.");
		console.warn("   Supported keys: " + Object.values(providerMap).join(", "));
		console.warn("   Please add at least one to your .env file.\n");
	}
};
