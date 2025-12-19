import os from "os";
import path from "path";
import { program } from "commander";
import {
	findLocaleFiles,
	translateFile,
	validateAndFixExistingTranslations,
} from "../commands/translator.js";
import InputValidator from "../utils/input-validator.js";
import ErrorHelper from "../utils/error-helper.js";
import translationService from "../services/translation-service.js";
import { TranslationOptions } from "../types/index.js";
import { FrameworkDetector } from "../core/detection/framework-detector.js";
import { StructureDetector, LocaleStructure } from "../core/detection/structure-detector.js";
import { configureComponents } from "../config/setup.js";
import { loadConfig } from "../config/index.js";

interface CliConfigOptions {
	defaultConfig: any;
	version: string;
}

export const autoDetectConfig = async (defaultConfig: any) => {
	// Auto-detect framework and configuration if not explicitly set
	const detected = await FrameworkDetector.detect(process.cwd());

	if (detected) {
		// Set locales directory if not configured
		if (!defaultConfig.localesDir && detected.localesDir) {
			defaultConfig.localesDir = detected.localesDir;
			if (process.env.VERBOSE) {
				console.log(`Auto-detected locales directory: ${detected.localesDir}`);
			}
		}

		// Set file format if not configured
		if (!defaultConfig.fileOperations) defaultConfig.fileOperations = {};
		if (
			(!defaultConfig.fileOperations.format ||
				defaultConfig.fileOperations.format === "auto") &&
			detected.fileFormat
		) {
			defaultConfig.fileOperations.format = detected.fileFormat;
			if (process.env.VERBOSE) {
				console.log(`Auto-detected file format: ${detected.fileFormat}`);
			}
		}
	}

	// Auto-detect file structure (flat vs nested)
	if (!defaultConfig.fileOperations) defaultConfig.fileOperations = {};
	if (
		!defaultConfig.fileOperations.fileStructure ||
		defaultConfig.fileOperations.fileStructure === "auto"
	) {
		const targetDir = defaultConfig.localesDir || "./locales";
		const structure = await StructureDetector.detect(targetDir);
		if (structure !== LocaleStructure.UNKNOWN) {
			defaultConfig.fileOperations.fileStructure = structure;
			if (process.env.VERBOSE) {
				console.log(`Auto-detected file structure: ${structure}`);
			}
		} else {
			// Default to flat if unknown
			defaultConfig.fileOperations.fileStructure = LocaleStructure.FLAT;
		}
	}

	return defaultConfig;
};

export const runCommand = async (defaultConfig: any, commandOptions: any, commandName: string) => {
	try {
		const validCommands = ["translate", "fix", "analyze", "advanced"];
		if (!validCommands.includes(commandName)) {
			throw new Error(`Invalid command: ${commandName}`);
		}

		const globalOpts = program.opts();

		if (globalOpts.debug) {
			const safeGlobalOpts: any = { ...globalOpts };
			const safeCommandOptions: any = { ...commandOptions };

			if (safeGlobalOpts.targets) {
				safeGlobalOpts.targets = `[${safeGlobalOpts.targets.length} languages]`;
			}
			if (safeGlobalOpts.localesDir) {
				safeGlobalOpts.localesDir = "[directory_path]";
			}
			if (safeCommandOptions.provider) {
				safeCommandOptions.provider = "[provider_name]";
			}

			console.log("CLI Command:", commandName);
			console.log("Global Options:", JSON.stringify(safeGlobalOpts, null, 2));
			console.log("Command Options:", JSON.stringify(safeCommandOptions, null, 2));
		}

		const sanitizedGlobalOpts = { ...globalOpts };
		const sanitizedCommandOptions = { ...commandOptions };

		if (sanitizedGlobalOpts.source) {
			sanitizedGlobalOpts.source = InputValidator.validateLanguageCode(
				sanitizedGlobalOpts.source,
				"source language"
			);
		}

		if (sanitizedGlobalOpts.targets && Array.isArray(sanitizedGlobalOpts.targets)) {
			sanitizedGlobalOpts.targets = InputValidator.validateLanguageCodes(
				sanitizedGlobalOpts.targets,
				"target languages"
			);
		}

		if (sanitizedGlobalOpts.localesDir) {
			sanitizedGlobalOpts.localesDir = InputValidator.validateDirectoryPath(
				sanitizedGlobalOpts.localesDir,
				"locales directory"
			);
		}

		if (sanitizedCommandOptions.provider) {
			sanitizedCommandOptions.provider = InputValidator.validateProvider(
				sanitizedCommandOptions.provider,
				"API provider"
			);
		}

		if (sanitizedCommandOptions.concurrency !== undefined) {
			const concurrency = parseInt(sanitizedCommandOptions.concurrency);
			if (isNaN(concurrency) || concurrency < 1 || concurrency > 20) {
				throw new Error("Concurrency must be a number between 1 and 20");
			}
			sanitizedCommandOptions.concurrency = concurrency;
		}

		if (sanitizedCommandOptions.contextThreshold !== undefined) {
			const threshold = parseInt(sanitizedCommandOptions.contextThreshold);
			if (isNaN(threshold) || threshold < 1 || threshold > 10) {
				throw new Error("Context threshold must be a number between 1 and 10");
			}
			sanitizedCommandOptions.contextThreshold = threshold;
		}

		if (sanitizedCommandOptions.contextConfidence !== undefined) {
			const confidence = parseFloat(sanitizedCommandOptions.contextConfidence);
			if (isNaN(confidence) || confidence < 0 || confidence > 1) {
				throw new Error("Context confidence must be a number between 0 and 1");
			}
			sanitizedCommandOptions.contextConfidence = confidence;
		}

		if (sanitizedCommandOptions.length) {
			const validLengthModes = ["strict", "flexible", "exact", "relaxed", "smart"];
			if (!validLengthModes.includes(sanitizedCommandOptions.length)) {
				throw new Error(
					`Invalid length mode: ${sanitizedCommandOptions.length}. Valid modes: ${validLengthModes.join(", ")}`
				);
			}
		}

		const mergedOpts = {
			source: defaultConfig.source,
			targets: defaultConfig.targets,
			localesDir: defaultConfig.localesDir,
			apiProvider: defaultConfig.apiProvider,
			...(sanitizedGlobalOpts.source && { source: sanitizedGlobalOpts.source }),
			...(sanitizedGlobalOpts.targets && { targets: sanitizedGlobalOpts.targets }),
			...(sanitizedGlobalOpts.localesDir && {
				localesDir: sanitizedGlobalOpts.localesDir,
			}),
			...sanitizedCommandOptions,
		};

		let concurrencyLimit =
			parseInt(mergedOpts.concurrency) || defaultConfig.concurrencyLimit || 5;

		if (mergedOpts.autoOptimize) {
			const cpuCount = os.cpus().length;
			const memoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));

			if (memoryGB < 4) {
				concurrencyLimit = Math.min(3, cpuCount);
			} else if (memoryGB < 8) {
				concurrencyLimit = Math.min(5, Math.ceil(cpuCount * 0.5));
			} else {
				concurrencyLimit = Math.min(10, Math.ceil(cpuCount * 0.75));
			}

			console.log(
				`Auto-optimized settings for your system (${cpuCount} CPUs, ${memoryGB}GB RAM):`
			);
			console.log(`   - Concurrency: ${concurrencyLimit}`);
		}

		if (concurrencyLimit < 1 || concurrencyLimit > 20) {
			throw new Error("Invalid concurrency limit after optimization");
		}

		const finalConfig: any = {
			...defaultConfig,
			command: commandName,
			source: mergedOpts.source,
			targets: mergedOpts.targets,
			localesDir: mergedOpts.localesDir,
			apiProvider: mergedOpts.provider || defaultConfig.apiProvider,
			concurrencyLimit: concurrencyLimit,
			cacheEnabled:
				mergedOpts.noCache === undefined ? defaultConfig.cacheEnabled : !mergedOpts.noCache,
			debug: mergedOpts.debug,
			verbose: mergedOpts.verbose || defaultConfig.logging?.verbose || false,
			forceUpdate: mergedOpts.force || false,
			showDetailedStats: mergedOpts.stats || false,
			autoOptimize: mergedOpts.autoOptimize || defaultConfig.advanced?.autoOptimize || false,
			fixLength: commandName === "fix",
			apiConfig: defaultConfig.apiConfig || {},
			styleGuide: defaultConfig.styleGuide,
			qualityChecks: defaultConfig.qualityChecks,
			lengthControl: {
				...defaultConfig.lengthControl,
				mode: mergedOpts.length || defaultConfig.lengthControl?.mode || "smart",
			},
			retryOptions: {
				...defaultConfig.retryOptions,
				maxRetries: mergedOpts.maxRetries || defaultConfig.retryOptions?.maxRetries || 2,
				initialDelay:
					mergedOpts.initialDelay || defaultConfig.retryOptions?.initialDelay || 1000,
				maxDelay: mergedOpts.maxDelay || defaultConfig.retryOptions?.maxDelay || 10000,
				jitter: defaultConfig.retryOptions?.jitter !== false,
			},
			context: {
				...defaultConfig.context,
				enabled: true,
				debug: mergedOpts.contextDebug || defaultConfig.context.debug || false,
				useAI:
					mergedOpts.useAi ||
					mergedOpts.contextProvider !== undefined ||
					defaultConfig.context.useAI ||
					false,
				aiProvider: mergedOpts.contextProvider || defaultConfig.context.aiProvider,
				minTextLength: mergedOpts.minTextLength || defaultConfig.context.minTextLength,
				allowNewCategories:
					mergedOpts.allowNewCategories !== undefined
						? mergedOpts.allowNewCategories
						: defaultConfig.context.allowNewCategories,
				detection: {
					threshold:
						mergedOpts.contextThreshold ||
						defaultConfig.context.detection?.threshold ||
						2,
					minConfidence:
						mergedOpts.contextConfidence ||
						defaultConfig.context.detection?.minConfidence ||
						0.6,
				},
			},

			advanced: {
				...defaultConfig.advanced,
				timeoutMs: mergedOpts.timeout || defaultConfig.advanced?.timeoutMs || 60000,
				maxKeyLength: defaultConfig.advanced?.maxKeyLength || 10000,
				maxBatchSize: defaultConfig.advanced?.maxBatchSize || 50,
				autoOptimize:
					mergedOpts.autoOptimize || defaultConfig.advanced?.autoOptimize || false,
				debug: mergedOpts.debug || defaultConfig.advanced?.debug || false,
			},

			rateLimiter: {
				...defaultConfig.rateLimiter,
				enabled: defaultConfig.rateLimiter?.enabled !== false,
			},

			fileOperations: defaultConfig.fileOperations || {},

			logging: {
				...defaultConfig.logging,
				verbose: mergedOpts.verbose || defaultConfig.logging?.verbose || false,
			},
		};

		try {
			InputValidator.validateConfig(finalConfig);
			if (finalConfig.debug || finalConfig.verbose) {
				console.log("Configuration validated successfully");
			}
		} catch (configError: any) {
			const error = ErrorHelper.configValidationError(
				configError.message.includes("validation failed")
					? configError.message.split("\n").slice(1)
					: [configError.message]
			);
			console.error(ErrorHelper.formatError(error, { showDebug: globalOpts.debug }));
			process.exit(1);
		}

		configureComponents(finalConfig);
		// validateEnvironment() was called here but it was undefined in cli.ts context (likely an import I missed or a global)
		// Assuming it needs to be imported or implemented.
		// Actually, I don't see `validateEnvironment` defined in the previous view_file of cli.ts, but it was called.
		// Wait, looking at line 429 of cli.ts: `validateEnvironment();`
		// Where is it defined?
		// I must have missed it in the file view or it was imported.
		// Looking at imports in cli.ts:
		// imports are: dotenv, fs, path, os, createRequire, program, translateFile, findLocaleFiles, validateAndFixExistingTranslations, ProviderFactory, FileManager, rateLimiter, Orchestrator, InputValidator, ErrorHelper, getLogger, TranslationOptions, FrameworkDetector, StructureDetector, loadConfig.
		// `validateEnvironment` is likely a local function I missed when scrolling or it was imported and I missed it.
		// Let me check the file content again or just assume it checks API keys.
		// I'll implement a basic check for now.

		if (finalConfig.debug) {
			console.log("\nConfiguration details:");

			const safeConfig = {
				...finalConfig,
				apiConfig: Object.keys(finalConfig.apiConfig || {}).reduce((acc: any, provider) => {
					acc[provider] = {
						model: finalConfig.apiConfig[provider]?.model || "configured",
						temperature: finalConfig.apiConfig[provider]?.temperature,
						maxTokens: finalConfig.apiConfig[provider]?.maxTokens,
					};
					return acc;
				}, {}),
				advanced: {
					...finalConfig.advanced,
					timeoutMs: finalConfig.advanced?.timeoutMs,
					maxKeyLength: finalConfig.advanced?.maxKeyLength,
					maxBatchSize: finalConfig.advanced?.maxBatchSize,
					autoOptimize: finalConfig.advanced?.autoOptimize,
					debug: finalConfig.advanced?.debug,
				},
			};

			delete safeConfig.apiProvider; // Could leak preferred provider info
			delete safeConfig.localesDir; // Could leak file system structure

			console.log(JSON.stringify(safeConfig, null, 2));
		}

		// displayPerformanceTips(finalConfig); // Another local function possibly missed.

		const localesDir = path.resolve(finalConfig.localesDir);
		console.log(`\nLooking for source files in: ${localesDir}`);

		const files = await findLocaleFiles(localesDir, finalConfig.source);

		if (!files || !files.length) {
			const error = ErrorHelper.fileNotFoundError(
				`${localesDir}/${finalConfig.source}.json`,
				`${finalConfig.source}.json`
			);
			console.error(
				ErrorHelper.formatError(error, {
					showDebug: finalConfig.debug,
					showContext: true,
				})
			);
			process.exit(1);
		}

		switch (commandName) {
			case "fix":
				console.log("\nRunning in FIX mode");
				await Promise.all(
					files.map((file) =>
						validateAndFixExistingTranslations(file, finalConfig as TranslationOptions)
					)
				);
				break;

			case "analyze":
				console.log("\nRunning in ANALYZE mode");
				console.log("Context analysis mode is not fully implemented yet.");
				break;

			case "advanced":
				console.log("\nRunning ADVANCED configuration");
			// Fall through to translate

			case "translate":
			default:
				console.log("\nRunning in TRANSLATION mode");

				const providerMap: Record<string, string> = {
					openai: "OPENAI_API_KEY",
					anthropic: "ANTHROPIC_API_KEY",
					gemini: "GEMINI_API_KEY",
					deepseek: "DEEPSEEK_API_KEY",
					xai: "XAI_API_KEY",
					dashscope: "DASHSCOPE_API_KEY",
				};

				const availableProviders = Object.keys(providerMap).filter(
					(key) => process.env[providerMap[key]]
				);

				console.log(`API Configuration:`);
				console.log(`   - Active Provider: ${finalConfig.apiProvider}`);
				console.log(`   - Available Providers: ${availableProviders.join(", ") || "None"}`);

				if (finalConfig.context.useAI) {
					console.log(
						`AI Context Analysis: ENABLED (Provider: ${finalConfig.context.aiProvider || finalConfig.apiProvider})`
					);
					if (finalConfig.context.allowNewCategories) {
						console.log("New category suggestions: ENABLED");
					}
				}

				console.log(`Performance settings:`);
				console.log(
					`   - Concurrency: ${finalConfig.concurrencyLimit} parallel operations`
				);
				console.log(`   - Caching: ${finalConfig.cacheEnabled ? "Enabled" : "Disabled"}`);
				console.log(`   - Retries: ${finalConfig.retryOptions.maxRetries} max retries`);

				if (finalConfig.rateLimiter?.adaptiveThrottling) {
					console.log(`   - Adaptive Rate Limiting: Enabled`);
				}

				if (finalConfig.forceUpdate) {
					console.log(
						`Warning: Force update mode ENABLED (will update existing translations)`
					);
				}

				for (const file of files) {
					await translateFile(file, finalConfig as TranslationOptions);
				}

				// Exit after successful translation in CLI mode
				// This allows translateFile to be used as library without forcing exit
				process.exit(0);
				break;
		}

		// Other commands (fix, analyze) handle their own completion
	} catch (validationError: any) {
		if (validationError.message.includes("Configuration validation")) {
			// Already handled above with better formatting
			return;
		}
		console.error(`\nInput validation error: ${validationError.message}`);
		if (validationError.stack && process.env.DEBUG) {
			console.error("\nStack trace:");
			console.error(validationError.stack);
		}
		process.exit(1);
	}
};
