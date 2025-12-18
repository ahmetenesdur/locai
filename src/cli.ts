#!/usr/bin/env node
import dotenv from "dotenv";

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { program } from "commander";
import {
	translateFile,
	findLocaleFiles,
	validateAndFixExistingTranslations,
} from "./commands/translator.js";
import ProviderFactory from "./core/provider-factory.js";
import { FileManager } from "./utils/file-manager.js";
import rateLimiter from "./utils/rate-limiter.js";
import Orchestrator from "./core/orchestrator.js";
import InputValidator from "./utils/input-validator.js";
import ErrorHelper from "./utils/error-helper.js";
import { getLogger } from "./utils/logger.js";
import { TranslationOptions } from "./services/translation-service.js";
import { FrameworkDetector } from "./core/detection/framework-detector.js";
import { StructureDetector, LocaleStructure } from "./core/detection/structure-detector.js";
import { loadConfig } from "./config/index.js";

// Use createRequire to load package.json in ESM context
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

/**
 * Load environment variables from .env files.
 * Prioritizes .env.local over .env.
 */
const loadEnvironmentVariables = async () => {
	// Load environment files in priority order
	// First load .env (base defaults), then .env.local (local overrides)
	// This ensures .env.local values take precedence over .env values
	const envFiles = [
		{ file: ".env", override: false },
		{ file: ".env.local", override: true },
	];
	let loadedCount = 0;

	for (const { file: envFile, override } of envFiles) {
		const envPath = path.resolve(process.cwd(), envFile);
		try {
			await fs.access(envPath);
			const result = dotenv.config({ path: envPath, override });

			if (!result.error) {
				loadedCount++;
				// Only log in verbose/debug mode to reduce noise
				if (process.env.VERBOSE || process.env.DEBUG) {
					console.log(`Loaded environment variables from ${envFile}`);
				}
			}
		} catch (error: any) {
			// ENOENT is expected when files don't exist - silently skip
			if (error.code !== "ENOENT") {
				console.warn(`Warning: Could not load ${envFile}: ${error.message}`);
			}
		}
	}

	// Informative message only if verbose/debug and at least one file was loaded
	if ((process.env.VERBOSE || process.env.DEBUG) && loadedCount > 0) {
		console.log(`Environment: ${loadedCount} file(s) loaded`);
	}
};

// Local config loader replaced by src/config/index.ts

/**
 * Configure global components (logger, rate limiter, etc.).
 * @param {any} config - Configuration object.
 */
const configureComponents = (config: any) => {
	// Configure FileManager with config settings
	if (config.fileOperations) {
		FileManager.configure(config.fileOperations);
	}

	// Initialize logger with config
	if (config.logging) {
		const logger = getLogger(config.logging);
		if (config.logging.verbose || config.debug) {
			logger.info("Logger initialized", {
				saveErrorLogs: config.logging.saveErrorLogs,
				logDirectory: config.logging.logDirectory,
				rotationEnabled: config.logging.logRotation?.enabled,
			});
		}
	}

	if (config.rateLimiter) {
		rateLimiter.updateConfig({
			queueStrategy: config.rateLimiter.queueStrategy || "priority",
			queueTimeout: config.rateLimiter.queueTimeout || 30000,
			adaptiveThrottling: config.rateLimiter.adaptiveThrottling !== false,
			providerLimits: config.rateLimiter.providerLimits,
		});
	}

	if (config.advanced?.debug) {
		process.env.DEBUG = "true";
	}

	if (config.logging?.verbose) {
		process.env.VERBOSE = "true";
	}
};

/**
 * Configure and run the CLI program.
 * @param {any} defaultConfig - Default configuration.
 * @returns {Promise<any>} - Final configuration.
 */
const configureCLI = async (defaultConfig: any): Promise<any> => {
	// Auto-detect framework and configuration if not explicitly set
	// This makes the tool framework-agnostic
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

	configureComponents(defaultConfig);

	// Use config version if available, otherwise use package.json version
	const toolVersion = defaultConfig.version || version;

	program
		.name("locai")
		.description("AI-powered localization tool for Next.js projects")
		.version(toolVersion);

	program
		.option("-s, --source <lang>", "Source language", defaultConfig.source)
		.option(
			"-t, --targets <langs>",
			"Target languages (comma separated)",
			(val) => val.split(","),
			defaultConfig.targets
		)
		.option("--localesDir <dir>", "Localization files directory", defaultConfig.localesDir)
		.option("--debug", "Enable debug mode with verbose logging", false)
		.option("--verbose", "Enable detailed diagnostic output", false);

	program.on("option:debug", function () {
		process.env.DEBUG = "true";
		console.log("Debug mode: ENABLED (verbose logging)");
	});

	program.on("option:verbose", function () {
		process.env.VERBOSE = "true";
		console.log("Verbose mode: ENABLED (detailed diagnostics)");
	});

	const runCommand = async (options: any, commandOptions: any, commandName: string) => {
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
					mergedOpts.noCache === undefined
						? defaultConfig.cacheEnabled
						: !mergedOpts.noCache,
				debug: mergedOpts.debug,
				verbose: mergedOpts.verbose || defaultConfig.logging?.verbose || false,
				forceUpdate: mergedOpts.force || false,
				showDetailedStats: mergedOpts.stats || false,
				autoOptimize:
					mergedOpts.autoOptimize || defaultConfig.advanced?.autoOptimize || false,
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
					maxRetries:
						mergedOpts.maxRetries || defaultConfig.retryOptions?.maxRetries || 2,
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

			validateEnvironment();

			if (finalConfig.debug) {
				console.log("\nConfiguration details:");

				const safeConfig = {
					...finalConfig,
					apiConfig: Object.keys(finalConfig.apiConfig || {}).reduce(
						(acc: any, provider) => {
							acc[provider] = {
								model: finalConfig.apiConfig[provider]?.model || "configured",
								temperature: finalConfig.apiConfig[provider]?.temperature,
								maxTokens: finalConfig.apiConfig[provider]?.maxTokens,
							};
							return acc;
						},
						{}
					),
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

			await displayPerformanceTips(finalConfig);

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
							validateAndFixExistingTranslations(
								file,
								finalConfig as TranslationOptions
							)
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
					console.log(
						`   - Caching: ${finalConfig.cacheEnabled ? "Enabled" : "Disabled"}`
					);
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

	program
		.command("translate")
		.description("Translate missing strings (default command)")
		.option("--provider <provider>", "Translation provider", defaultConfig.apiProvider)
		.option(
			"--concurrency <number>",
			"Number of concurrent translations",
			Number,
			defaultConfig.concurrencyLimit
		)
		.option("--no-cache", "Disable translation caching")
		.option("--force", "Force update of existing translations", false)
		.option(
			"--length <mode>",
			"Length control mode",
			defaultConfig.lengthControl?.mode || "smart"
		)
		.option("--auto-optimize", "Auto-optimize system parameters based on hardware", false)
		.option("--stats", "Show detailed stats after completion", false)
		.option("--min-confidence <score>", "Minimum confidence threshold (0-1)", parseFloat)
		.option("--save-review-queue", "Save low-confidence items for manual review", false)
		.action(async (options) => {
			try {
				await runCommand(program.opts(), options, "translate");
			} catch (error: any) {
				// Handle errors with better formatting
				if (error.code && error.code.startsWith("ERR_")) {
					console.error(
						ErrorHelper.formatError(error, {
							showDebug: process.env.DEBUG === "true",
							showSolutions: true,
							showContext: true,
						})
					);
				} else {
					console.error(`\nError: ${error.message}`);
					if (error.stack && process.env.DEBUG) {
						console.error(error.stack);
					}
				}
				process.exit(1);
			}
		});

	program
		.command("fix")
		.description("Fix issues in existing translations")
		.option("--length", "Fix length issues in existing translations", true)
		.action(async (options) => {
			try {
				await runCommand(program.opts(), options, "fix");
			} catch (error: any) {
				if (error.code && error.code.startsWith("ERR_")) {
					console.error(
						ErrorHelper.formatError(error, { showDebug: process.env.DEBUG === "true" })
					);
				} else {
					console.error(`\nError: ${error.message}`);
					if (error.stack && process.env.DEBUG) {
						console.error(error.stack);
					}
				}
				process.exit(1);
			}
		});

	program
		.command("analyze")
		.description("Analyze context patterns")
		.option("--use-ai", "Enable AI-based context analysis", defaultConfig.context.useAI)
		.option(
			"--context-provider <provider>",
			"AI provider for analysis",
			defaultConfig.context.aiProvider
		)
		.option(
			"--context-threshold <number>",
			"Minimum match count",
			Number,
			defaultConfig.context.detection.threshold
		)
		.action(async (options) => {
			try {
				await runCommand(program.opts(), options, "analyze");
			} catch (error: any) {
				if (error.code && error.code.startsWith("ERR_")) {
					console.error(
						ErrorHelper.formatError(error, { showDebug: process.env.DEBUG === "true" })
					);
				} else {
					console.error(`\nError: ${error.message}`);
					if (error.stack && process.env.DEBUG) {
						console.error(error.stack);
					}
				}
				process.exit(1);
			}
		});

	program
		.command("advanced")
		.description("Access advanced configuration options")
		.option(
			"--context-confidence <number>",
			"Minimum confidence score",
			Number,
			defaultConfig.context.detection.minConfidence
		)
		.option("--context-debug", "Show context details", defaultConfig.context.debug)
		.option(
			"--min-text-length <number>",
			"Minimum text length for AI analysis",
			Number,
			defaultConfig.context.minTextLength
		)
		.option(
			"--allow-new-categories",
			"Allow AI to suggest new categories",
			defaultConfig.context.allowNewCategories
		)
		.option(
			"--max-retries <number>",
			"Maximum number of retries for API calls",
			Number,
			defaultConfig.retryOptions?.maxRetries || 2
		)
		.action(async (options) => {
			try {
				await runCommand(program.opts(), options, "advanced");
			} catch (error: any) {
				if (error.code && error.code.startsWith("ERR_")) {
					console.error(
						ErrorHelper.formatError(error, { showDebug: process.env.DEBUG === "true" })
					);
				} else {
					console.error(`\nError: ${error.message}`);
					if (error.stack && process.env.DEBUG) {
						console.error(error.stack);
					}
				}
				process.exit(1);
			}
		});

	program
		.command("validate-config")
		.description("Validate configuration file without running translations")
		.option("--show-warnings", "Show configuration warnings", false)
		.action(async (options) => {
			try {
				console.log("Validating configuration...\n");

				// Temporarily enable verbose to show warnings if requested
				const originalDebug = defaultConfig.debug;
				const originalVerbose = defaultConfig.verbose;
				if (options.showWarnings) {
					defaultConfig.debug = true;
					defaultConfig.verbose = true;
				}

				try {
					InputValidator.validateConfig(defaultConfig);
					console.log("Configuration is valid!\n");

					// Show summary
					console.log("Configuration Summary:");
					if (defaultConfig.version) {
						console.log(`   Version: ${defaultConfig.version}`);
					}
					console.log(`   Source: ${defaultConfig.source}`);
					console.log(
						`   Targets: ${defaultConfig.targets.length} languages (${defaultConfig.targets.slice(0, 5).join(", ")}${defaultConfig.targets.length > 5 ? "..." : ""})`
					);
					console.log(`   API Provider: ${defaultConfig.apiProvider || "auto-detect"}`);
					console.log(
						`   Concurrency: ${defaultConfig.concurrencyLimit || 5} parallel operations`
					);
					console.log(
						`   Cache: ${defaultConfig.cacheEnabled !== false ? "Enabled" : "Disabled"}`
					);

					if (defaultConfig.context?.enabled) {
						console.log(
							`   Context Detection: ${defaultConfig.context.useAI ? "AI-powered" : "Keyword-based"}`
						);
					}

					if (defaultConfig.useFallback) {
						const fallbackChain =
							defaultConfig.fallbackOrder?.slice(0, 3).join(" → ") || "auto";
						console.log(`   Fallback Chain: ${fallbackChain}`);
					}

					console.log("\nYour configuration is ready to use!");
					console.log("Run 'localize translate' to start translating\n");
				} finally {
					// Restore original values
					defaultConfig.debug = originalDebug;
					defaultConfig.verbose = originalVerbose;
				}
				process.exit(0);
			} catch (error: any) {
				console.error("\nConfiguration Validation Failed:\n");
				console.error(error.message);
				console.error("\nFix the errors above and try again\n");
				process.exit(1);
			}
		});

	program
		.command("review")
		.description("Interactively review low-confidence translations")
		.option("--export <format>", "Export review queue (json|csv)")
		.action(async (options) => {
			try {
				const ReviewCommand = (await import("../src/commands/review.js")).default;

				const review = new ReviewCommand(defaultConfig);

				if (options.export) {
					review.exportReviewQueue(options.export);
				} else {
					await review.startReview();
				}
			} catch (error: any) {
				console.error(`\nError: ${error.message}`);
				if (error.stack && process.env.DEBUG) {
					console.error(error.stack);
				}
				process.exit(1);
			}
		});

	program.action(async () => {
		try {
			await runCommand(program.opts(), {}, "translate");
		} catch (error: any) {
			console.error(`\nError: ${error.message}`);
			if (error.stack && process.env.DEBUG) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	});

	program.parse(process.argv);

	return defaultConfig;
};

/**
 * Validate that necessary environment variables are set.
 * @returns {Array<string>} - List of available providers.
 */
const validateEnvironment = (): string[] => {
	try {
		// Check that ProviderFactory can validate providers
		const availableProviders = ProviderFactory.validateProviders();

		console.log(`\nAvailable API providers: ${availableProviders.join(", ")}`);

		return availableProviders;
	} catch (error: any) {
		console.error("\nError: " + error.message);
		console.error("Please set at least one of the following environment variables:");

		const possibleProviders = [
			"DASHSCOPE_API_KEY",
			"OPENAI_API_KEY",
			"DEEPSEEK_API_KEY",
			"GEMINI_API_KEY",
			"XAI_API_KEY",
		];

		possibleProviders.forEach((key) => console.error(`  - ${key}`));
		process.exit(1);
	}
};

/**
 * Display performance optimizations and tips.
 * @param {any} options - Configuration options.
 */
const displayPerformanceTips = async (options: any) => {
	if (!options.debug) return;

	try {
		const cpuCount = os.cpus().length;
		const cpuModel = os.cpus()[0]?.model || "Unknown CPU";
		const memoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
		const freememGB = Math.floor(os.freemem() / (1024 * 1024 * 1024));

		const orchestrator = new Orchestrator(options);
		const cacheStats = orchestrator.getCacheStats();

		console.log("\nPerformance Information:");
		console.log(`   - CPU: ${cpuModel} (${cpuCount} cores)`);
		console.log(`   - Memory: ${freememGB}GB free of ${memoryGB}GB total`);
		console.log(`   - Concurrency: ${options.concurrencyLimit} parallel operations`);
		console.log(
			`   - Cache: ${options.cacheEnabled ? "Enabled" : "Disabled"} (${cacheStats.size} items cached)`
		);

		// Provide tips
		console.log("\nPerformance Tips:");

		if (cpuCount > options.concurrencyLimit * 2) {
			console.log(
				`   - Increase concurrency with --concurrency ${Math.min(cpuCount, 10)} to better utilize your CPU`
			);
		}

		if (!options.cacheEnabled) {
			console.log(`   - Enable caching to improve repeated runs speed`);
		}

		if (memoryGB < 4) {
			console.log(
				`   - Your system has limited memory (${memoryGB}GB). Consider reducing concurrency if you experience issues.`
			);
		}
	} catch (error) {
		console.log("Warning: Could not calculate performance tips", error);
	}
};

try {
	await loadEnvironmentVariables();
	let defaultConfig: any;

	try {
		const { config, configFile } = await loadConfig();
		defaultConfig = config;

		if (configFile) {
			console.log(`Loaded config from: ${path.relative(process.cwd(), configFile)}`);
		} else {
			console.log("No config file found, using defaults");
		}
	} catch (err: any) {
		console.warn(`Warning: Could not load config: ${err.message}`);
		// Fallback defaults if logic fails totally (shouldn't with c12 defaults)
		defaultConfig = {
			source: "en",
			targets: [],
			concurrencyLimit: 5,
		};
	}

	await configureCLI(defaultConfig);
} catch (error: any) {
	console.error(`\nError: ${error.message}`);
	if (error.stack && process.env.DEBUG) {
		console.error(error.stack);
	}
	process.exit(1);
}
