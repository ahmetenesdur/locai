import path from "path";
import { FileManager } from "../utils/file-manager.js";
import ObjectTransformer from "../utils/object-transformer.js";
import Orchestrator from "../core/orchestrator.js";
import { OrchestratorOptions } from "../core/orchestrator.js";
import QualityChecker from "../utils/quality/index.js";
import StateManager from "../utils/state-manager.js";
import InputValidator from "../utils/input-validator.js";
import gracefulShutdown from "../utils/graceful-shutdown.js";
import uiManager from "../utils/ui-manager.js";
import statisticsManager from "../utils/statistics-manager.js";
import { TranslationResult } from "../core/pipeline/context.js";
import { LanguageProcessor } from "./language-processor.js";
import { SourceCodeAnalyzer } from "./source-analyzer.js";
import {
	TranslationOptions,
	GlobalStats,
	LanguageProcessResult,
	MissingKey,
} from "../types/index.js";

/**
 * Service for handling file translation operations.
 * Orchestrates the translation process including state management,
 * verification, and statistics collection.
 */
class TranslationService {
	/**
	 * Main translator function to process source file and create translations.
	 * @param {string} file - Path to source file.
	 * @param {TranslationOptions} options - Translation options.
	 * @returns {Promise<GlobalStats>} - Global statistics object.
	 * @throws {Error} If validation fails or translation process errors.
	 */
	async translateFile(file: string, options: TranslationOptions): Promise<GlobalStats> {
		await uiManager.log(`\nProcessing File: "${path.basename(file)}"`);

		try {
			const resolvedFile = await this.validateTranslationInputs(file, options);

			const startTime = Date.now();
			const sourceContent = await FileManager.readJSON(resolvedFile);
			const flattenedSource = ObjectTransformer.flatten(sourceContent);
			const totalKeys = Object.keys(flattenedSource).length;

			await uiManager.log(`Source file contains ${totalKeys} translation keys`);

			const { stateManager, projectRoot, currentState, comparison } =
				await this.initializeTranslationState(resolvedFile, flattenedSource, options);

			gracefulShutdown.registerCallback(async () => {
				try {
					await stateManager.saveState(projectRoot, currentState);
					console.log("State saved during shutdown");
				} catch (error: any) {
					console.error("Failed to save state during shutdown:", error.message);
				}
			});

			statisticsManager.reset();
			const globalStats = statisticsManager.getStats() as GlobalStats;

			try {
				await this.processAllLanguages(
					resolvedFile,
					flattenedSource,
					options,
					globalStats,
					comparison
				);

				await this.finalizeTranslation(
					stateManager,
					projectRoot,
					currentState,
					globalStats,
					startTime,
					options
				);

				return globalStats;
			} catch (error: any) {
				await uiManager.log(`\nTranslation error: ${error.message}`);

				globalStats.error = {
					message: error.message,
					time: new Date().toISOString(),
					stack: process.env.DEBUG ? error.stack : undefined,
				};

				throw error;
			} finally {
				if (process.env.DEBUG) {
					await uiManager.log("\nCache statistics:");
				}
			}
		} catch (validationError: any) {
			await uiManager.log(`\nInput validation error: ${validationError.message}`);
			throw validationError;
		}
	}

	/**
	 * Validate input parameters for translation process.
	 * @param {string} file - Path to source file.
	 * @param {TranslationOptions} options - Translation options.
	 * @returns {Promise<string>} - Resolved absolute path to source file.
	 * @throws {Error} If inputs are invalid.
	 */
	async validateTranslationInputs(file: string, options: TranslationOptions): Promise<string> {
		if (!file || typeof file !== "string") {
			throw new Error("File path must be a non-empty string");
		}

		if (!options || typeof options !== "object") {
			throw new Error("Options must be an object");
		}

		if (options.source) {
			options.source = InputValidator.validateLanguageCode(options.source, "source language");
		}

		if (options.targets && Array.isArray(options.targets)) {
			options.targets = InputValidator.validateLanguageCodes(
				options.targets,
				"target languages"
			);
		}

		if (options.localesDir) {
			options.localesDir = InputValidator.validateDirectoryPath(
				options.localesDir,
				"locales directory"
			);
		}

		const resolvedFile = path.resolve(file);
		const cwd = process.cwd();
		if (!resolvedFile.startsWith(cwd)) {
			throw new Error(
				`Source file '${file}' is outside working directory (resolved: ${resolvedFile})`
			);
		}

		return resolvedFile;
	}

	/**
	 * Initialize translation state and sync analysis.
	 * @param {string} resolvedFile - Path to resolved source file.
	 * @param {Record<string, any>} flattenedSource - Flattened source content.
	 * @param {TranslationOptions} options - Translation options.
	 * @returns {Promise<Object>} - Initialized state components.
	 */
	async initializeTranslationState(
		resolvedFile: string,
		flattenedSource: Record<string, any>,
		options: TranslationOptions
	) {
		const stateManager = new StateManager(options.syncOptions);
		const projectRoot = process.cwd();

		const previousState = await stateManager.loadState(projectRoot);
		const currentState = stateManager.generateStateFromSource(flattenedSource);

		const comparison = stateManager.compareStates(previousState, currentState);
		const stats = stateManager.getComparisonStats(comparison);

		if (stats.hasChanges) {
			await uiManager.log(`\nSync Analysis:`);
			await uiManager.log(`   New keys: ${stats.newCount}`);
			await uiManager.log(`   Modified keys: ${stats.modifiedCount}`);
			await uiManager.log(`   Deleted keys: ${stats.deletedCount}`);

			// Handle deleted keys - remove them from all target files
			const syncEnabled = options.syncOptions?.enabled !== false;
			const removeDeletedEnabled = options.syncOptions?.removeDeletedKeys !== false;

			if (
				comparison?.deletedKeys &&
				Array.isArray(comparison.deletedKeys) &&
				comparison.deletedKeys.length > 0 &&
				syncEnabled &&
				removeDeletedEnabled
			) {
				await uiManager.log(
					`\nRemoving ${comparison.deletedKeys.length} deleted keys from target files...`
				);
				await this.removeDeletedKeysFromTargets(
					resolvedFile,
					comparison.deletedKeys,
					options
				);
			}
		} else if (
			previousState &&
			typeof previousState === "object" &&
			Object.keys(previousState).length > 0
		) {
			await uiManager.log(`No changes detected in source file`);
		} else {
			await uiManager.log(`First run - will process all keys`);
		}

		return { stateManager, projectRoot, currentState, comparison };
	}

	/**
	 * Process all target languages with concurrency.
	 * @param {string} resolvedFile - Path to source file.
	 * @param {Record<string, any>} flattenedSource - Flattened source content.
	 * @param {TranslationOptions} options - Translation options.
	 * @param {GlobalStats} globalStats - Global statistics object to update.
	 * @param {any} comparison - State comparison result.
	 */
	async processAllLanguages(
		resolvedFile: string,
		flattenedSource: Record<string, any>,
		options: TranslationOptions,
		globalStats: GlobalStats,
		comparison: any
	) {
		const languageConcurrency = options.concurrencyLimit || 3;
		const targetLanguages = [...(options.targets || [])];

		await uiManager.log(
			`Processing ${targetLanguages.length} languages with concurrency of ${languageConcurrency}`
		);

		// Initialize shared SourceCodeAnalyzer
		console.log("Initializing Locai Engine...");
		const sharedAnalyzer = new SourceCodeAnalyzer();
		sharedAnalyzer.initialize();

		// Create shared orchestrators array to collect review queues
		const orchestrators: Orchestrator[] = [];

		for (let i = 0; i < targetLanguages.length; i += languageConcurrency) {
			const currentBatch = targetLanguages.slice(i, i + languageConcurrency);
			// Respect user's progress options, but default logToConsole to false for batch processing
			// unless explicitly forced by the user in the config (not just inherited default)
			const progressOptions = {
				...options.progressOptions,
				// If not explicitly set in options, default to false for batch mode to prevent garbled output
				logToConsole: options.progressOptions?.logToConsole ?? false,
			};

			const batchResults = await Promise.all(
				currentBatch.map((targetLang) => {
					const orchestrator = new Orchestrator({
						...options,
						concurrencyLimit: 1,
						progressOptions,
						sourceCodeAnalyzer: sharedAnalyzer,
					} as OrchestratorOptions);
					orchestrators.push(orchestrator);
					return this.processLanguage(
						targetLang,
						resolvedFile,
						flattenedSource,
						orchestrator,
						{ ...options, progressOptions },
						globalStats,
						comparison
					);
				})
			);

			await uiManager.logBatchResults(batchResults);
		}

		// Store orchestrators in globalStats for later access
		globalStats.orchestrators = orchestrators;
	}

	/**
	 * Process a single language translation.
	 * @param {string} targetLang - Target language code.
	 * @param {string} sourceFile - Path to source file.
	 * @param {Record<string, any>} flattenedSource - Flattened source content.
	 * @param {Orchestrator} orchestrator - Orchestrator instance.
	 * @param {TranslationOptions} options - Translation options.
	 * @param {GlobalStats} globalStats - Global statistics object.
	 * @param {any} comparison - State comparison result.
	 * @returns {Promise<LanguageProcessResult>} - Status and messages for this language.
	 */
	async processLanguage(
		targetLang: string,
		sourceFile: string,
		flattenedSource: Record<string, any>,
		orchestrator: Orchestrator,
		options: TranslationOptions,
		globalStats: GlobalStats,
		comparison: any
	): Promise<LanguageProcessResult> {
		return await LanguageProcessor.processLanguage(
			targetLang,
			sourceFile,
			flattenedSource,
			orchestrator,
			options,
			globalStats,
			comparison
		);
	}

	/**
	 * Finalize translation process and save state.
	 * @param {StateManager} stateManager - State manager instance.
	 * @param {string} projectRoot - Project root directory.
	 * @param {any} currentState - Current state object.
	 * @param {GlobalStats} globalStats - Global statistics object.
	 * @param {number} startTime - Process start timestamp.
	 * @param {TranslationOptions} options - Translation options.
	 */
	async finalizeTranslation(
		stateManager: StateManager,
		projectRoot: string,
		currentState: any,
		globalStats: GlobalStats,
		startTime: number,
		options: TranslationOptions
	) {
		globalStats.endTime = new Date().toISOString();
		globalStats.totalDuration = (Date.now() - startTime) / 1000;
		globalStats.totalTime = globalStats.totalDuration;

		await uiManager.displayGlobalSummary(globalStats, (options.targets || []).length);

		// Save review queue if confidence scoring was enabled
		if (options.saveReviewQueue || options.minConfidence !== undefined) {
			if (globalStats.orchestrators && globalStats.orchestrators.length > 0) {
				// Collect all review queues from all orchestrators
				const allReviewItems: any[] = [];
				globalStats.orchestrators.forEach((orchestrator) => {
					if (
						orchestrator.confidenceSettings &&
						orchestrator.confidenceSettings.reviewQueue
					) {
						allReviewItems.push(...orchestrator.confidenceSettings.reviewQueue);
					}
				});

				// If we have items to review, save them
				if (allReviewItems.length > 0) {
					// Use first orchestrator to save, but update its review queue
					const orchestrator = globalStats.orchestrators[0];
					orchestrator.confidenceSettings.reviewQueue = allReviewItems;
					orchestrator.saveReviewQueue();
				}
			}
		}

		try {
			await stateManager.saveState(projectRoot, currentState);
			if (options.debug) {
				await uiManager.log(`State saved for future sync operations`);
			}
		} catch (error: any) {
			await uiManager.log(`Warning: Could not save state: ${error.message}`);
		}
	}

	/**
	 * Remove deleted keys from all target language files.
	 * @param {string} sourceFile - Path to source file.
	 * @param {string[]} deletedKeys - Array of keys to delete.
	 * @param {TranslationOptions} options - Translation options.
	 */
	async removeDeletedKeysFromTargets(
		sourceFile: string,
		deletedKeys: string[],
		options: TranslationOptions
	) {
		const sourceDir = path.dirname(sourceFile);
		let totalRemoved = 0;
		let filesProcessed = 0;

		for (const targetLang of options.targets || []) {
			try {
				const safeTargetFilename = `${targetLang}.json`;
				const targetPath = InputValidator.createSafeFilePath(sourceDir, safeTargetFilename);

				// Check if target file exists
				const fileExists = await FileManager.exists(targetPath);
				if (!fileExists) {
					await uiManager.log(`   Skipping ${targetLang}.json (file doesn't exist)`);
					continue;
				}

				// Read target file
				const targetContent = await FileManager.readJSON(targetPath);
				const flattenedTarget = ObjectTransformer.flatten(targetContent);

				// Remove deleted keys
				let removedFromThisFile = 0;
				for (const key of deletedKeys) {
					if (key in flattenedTarget) {
						delete flattenedTarget[key];
						removedFromThisFile++;
						totalRemoved++;
					}
				}

				// Save updated file only if we removed something
				if (removedFromThisFile > 0) {
					const unflattened = ObjectTransformer.unflatten(flattenedTarget);
					await FileManager.writeJSON(targetPath, unflattened);
					await uiManager.log(
						`   ${targetLang}.json: Removed ${removedFromThisFile} keys`
					);
				} else {
					await uiManager.log(`   No keys to remove from ${targetLang}.json`);
				}

				filesProcessed++;
			} catch (error: any) {
				await uiManager.log(
					`   \u274c Error processing ${targetLang}.json: ${error.message}`
				);
			}
		}

		await uiManager.log(
			`Cleanup Summary: Removed ${totalRemoved} keys from ${filesProcessed} files\n`
		);
	}

	/**
	 * Validate and fix existing translations that have length issues.
	 * @param {string} file - Path to source file.
	 * @param {TranslationOptions} options - Translation options.
	 * @throws {Error} If validation process fails.
	 */
	async validateAndFixExistingTranslations(file: string, options: TranslationOptions) {
		await uiManager.log(`\nChecking existing translations in: "${path.basename(file)}"`);

		const sourceContent = await FileManager.readJSON(file);
		const flattenedSource = ObjectTransformer.flatten(sourceContent);
		const orchestrator = new Orchestrator(options as OrchestratorOptions);

		const languageResults = await Promise.all(
			(options.targets || []).map(async (targetLang) => {
				try {
					const targetPath = path.join(path.dirname(file), `${targetLang}.json`);
					const targetContent = await FileManager.readJSON(targetPath);
					return { targetLang, targetPath, content: targetContent, success: true };
				} catch (err: any) {
					await uiManager.log(`Could not read ${targetLang}.json: ${err.message}`);
					return {
						targetLang,
						targetPath: "",
						content: {},
						success: false,
						error: err.message,
					};
				}
			})
		);

		const validLanguages = languageResults.filter((result) => result.success);

		try {
			let totalFixed = 0;
			let totalIssues = 0;

			const qualityChecker = new QualityChecker({
				styleGuide: options.styleGuide,
				context: options.context,
				lengthControl: options.lengthControl,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...(options.qualityChecks?.rules || {}),
				enabled: true,
			});

			// Process languages sequentially to avoid overwhelming the API
			for (const langData of validLanguages) {
				const { targetLang, targetPath, content } = langData;
				const flattenedTarget = ObjectTransformer.flatten(content);
				const invalidItems: MissingKey[] = [];

				for (const [key, translatedText] of Object.entries(flattenedTarget)) {
					const sourceText = flattenedSource[key];
					if (!sourceText) continue;

					const checkResult = qualityChecker.validate(
						sourceText as string,
						translatedText as string,
						{
							...options,
							targetLang,
						}
					);

					const lengthIssue = checkResult.issues.find((i) => i.type === "length");

					if (lengthIssue) {
						invalidItems.push({
							key,
							text: sourceText as string,
							targetLang,
							existingTranslation: translatedText as string,
							issueDetails: lengthIssue,
							isModified: false,
							isNew: false,
						});
					}
				}

				if (invalidItems.length > 0) {
					totalIssues += invalidItems.length;
					await uiManager.log(
						`Found ${invalidItems.length} length issues in ${targetLang}`
					);

					// Batch process fixes to improve performance
					const results = await orchestrator.processTranslations(invalidItems);

					const fixedCount = results.filter((r) => r.success).length;
					totalFixed += fixedCount;

					results.forEach(({ key, translated, success }) => {
						if (success && translated) {
							flattenedTarget[key] = translated;
						}
					});

					const unflattened = ObjectTransformer.unflatten(flattenedTarget);
					await FileManager.writeJSON(targetPath, unflattened);

					await uiManager.log(
						`Fixed ${fixedCount}/${invalidItems.length} translations in ${targetLang}`
					);
				} else {
					await uiManager.log(`No length issues found in ${targetLang}`);
				}
			}

			if (totalIssues > 0) {
				await uiManager.log(
					`\nFix Length Summary: Fixed ${totalFixed} of ${totalIssues} issues (${Math.round((totalFixed / totalIssues) * 100)}%)`
				);
			} else {
				await uiManager.log(`\nNo length issues found in any language`);
			}
		} catch (error: any) {
			await uiManager.log(`\nValidation error: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Find locale files
	 */
	async findLocaleFiles(localesDir: string, sourceLang: string): Promise<string[]> {
		try {
			return await FileManager.findLocaleFiles(localesDir, sourceLang);
		} catch (error: any) {
			await uiManager.log(`Error finding locale files: ${error.message}`);
			return [];
		}
	}
}

export default new TranslationService();
