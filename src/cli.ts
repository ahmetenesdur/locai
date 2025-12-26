#!/usr/bin/env node
import { createRequire } from "module";
import { program } from "commander";
import ErrorHelper from "./utils/error-helper.js";
import { loadConfig, validateEnvironment } from "./config/index.js";
import { loadEnvironmentVariables, configureComponents } from "./config/setup.js";
import { autoDetectConfig, runCommand } from "./cli/helpers.js";
import InputValidator from "./utils/input-validator.js";

// Use createRequire to load package.json in ESM context
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const main = async () => {
	await loadEnvironmentVariables();

	// Load configuration
	const loaded = await loadConfig();
	let defaultConfig = loaded.config || {};

	defaultConfig = await autoDetectConfig(defaultConfig);
	configureComponents(defaultConfig);
	validateEnvironment(defaultConfig);

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
		.option("--no-deep-context", "Disable deep context analysis (source code scanning)")
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
				await runCommand(defaultConfig, options, "translate");
			} catch (error: any) {
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
				await runCommand(defaultConfig, options, "fix");
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
		.option("--use-ai", "Enable AI-based context analysis", defaultConfig.context?.useAI)
		.option(
			"--context-provider <provider>",
			"AI provider for analysis",
			defaultConfig.context?.aiProvider
		)
		.option(
			"--context-threshold <number>",
			"Minimum match count",
			Number,
			defaultConfig.context?.detection?.threshold
		)
		.action(async (options) => {
			try {
				await runCommand(defaultConfig, options, "analyze");
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
			defaultConfig.context?.detection?.minConfidence
		)
		.option("--context-debug", "Show context details", defaultConfig.context?.debug)
		.option(
			"--min-text-length <number>",
			"Minimum text length for AI analysis",
			Number,
			defaultConfig.context?.minTextLength
		)
		.option(
			"--allow-new-categories",
			"Allow AI to suggest new categories",
			defaultConfig.context?.allowNewCategories
		)
		.option(
			"--max-retries <number>",
			"Maximum number of retries for API calls",
			Number,
			defaultConfig.retryOptions?.maxRetries || 2
		)
		.action(async (options) => {
			try {
				await runCommand(defaultConfig, options, "advanced");
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
						`   Targets: ${(defaultConfig.targets || []).length} languages (${(defaultConfig.targets || []).slice(0, 5).join(", ")}${(defaultConfig.targets || []).length > 5 ? "..." : ""})`
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
				const ReviewCommand = (await import("./commands/review.js")).default;
				// Ensure config matches expectations of ReviewCommand
				// ReviewCommand expects ConfigLayer/LocalizeConfig, need to ensure mandatory fields or cast
				// ReviewCommandConfig requires localesDir and source to be strings (not undefined)
				const reviewConfig = {
					...defaultConfig,
					localesDir: defaultConfig.localesDir || "./locales",
					source: defaultConfig.source || "en",
				} as any;

				const review = new ReviewCommand(reviewConfig);

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
			await runCommand(defaultConfig, {}, "translate");
		} catch (error: any) {
			console.error(`\nError: ${error.message}`);
			process.exit(1);
		}
	});

	await program.parseAsync(process.argv);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
