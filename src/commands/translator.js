import path from "path";
import { FileManager } from "../utils/file-manager.js";
import ObjectTransformer from "../utils/object-transformer.js";
import Orchestrator from "../core/orchestrator.js";
import QualityChecker from "../utils/quality/index.js";
import StateManager from "../utils/state-manager.js";
import InputValidator from "../utils/input-validator.js";
import gracefulShutdown from "../utils/graceful-shutdown.js";

/**
 * Check if text only contains placeholders and whitespace
 */
function isPlaceholderOnlyText(text) {
	if (!text || typeof text !== "string") {
		return false;
	}

	// Remove all placeholders from the text
	const placeholderRegex = /\{[^}]+\}|\$\{[^}]+\}|%[sd]/g;
	const textWithoutPlaceholders = text.replace(placeholderRegex, "").trim();

	return textWithoutPlaceholders.length === 0;
}

// Prevents overlapping console output
const consoleLock = {
	queue: [],
	isLocked: false,

	async log(message) {
		return new Promise((resolve) => {
			const executeLog = () => {
				console.log(message);
				this.isLocked = false;
				resolve();
				this._processQueue();
			};

			if (this.isLocked) {
				this.queue.push(executeLog);
			} else {
				this.isLocked = true;
				executeLog();
			}
		});
	},

	_processQueue() {
		if (this.queue.length > 0 && !this.isLocked) {
			this.isLocked = true;
			const nextLog = this.queue.shift();
			nextLog();
		}
	},
};

/**
 * Validate input parameters for translation process
 */
async function validateTranslationInputs(file, options) {
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
		options.targets = InputValidator.validateLanguageCodes(options.targets, "target languages");
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
 * Initialize translation state and sync analysis
 */
async function initializeTranslationState(resolvedFile, flattenedSource, options) {
	const stateManager = new StateManager(options.syncOptions);
	const projectRoot = process.cwd();

	const previousState = await stateManager.loadState(projectRoot);
	const currentState = stateManager.generateStateFromSource(flattenedSource);

	const comparison = stateManager.compareStates(previousState, currentState);
	const stats = stateManager.getComparisonStats(comparison);

	if (stats.hasChanges) {
		await consoleLock.log(`\nSync Analysis:`);
		await consoleLock.log(`   New keys: ${stats.newCount}`);
		await consoleLock.log(`   Modified keys: ${stats.modifiedCount}`);
		await consoleLock.log(`   Deleted keys: ${stats.deletedCount}`);

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
			await consoleLock.log(
				`\nRemoving ${comparison.deletedKeys.length} deleted keys from target files...`
			);
			await removeDeletedKeysFromTargets(resolvedFile, comparison.deletedKeys, options);
		}
	} else if (
		previousState &&
		typeof previousState === "object" &&
		Object.keys(previousState).length > 0
	) {
		await consoleLock.log(`No changes detected in source file`);
	} else {
		await consoleLock.log(`First run - will process all keys`);
	}

	return { stateManager, projectRoot, currentState, comparison };
}

/**
 * Initialize global statistics structure
 */
function initializeGlobalStats() {
	return {
		total: 0,
		byCategory: {},
		details: {},
		totalTime: 0,
		success: 0,
		failed: 0,
		skipped: 0,
		languages: {},
		startTime: new Date().toISOString(),
	};
}

/**
 * Process all target languages
 */
async function processAllLanguages(
	resolvedFile,
	flattenedSource,
	options,
	globalStats,
	comparison
) {
	const languageConcurrency = options.concurrencyLimit || 3;
	const targetLanguages = [...options.targets];

	await consoleLock.log(
		`Processing ${targetLanguages.length} languages with concurrency of ${languageConcurrency}`
	);

	// Create shared orchestrators array to collect review queues
	const orchestrators = [];

	for (let i = 0; i < targetLanguages.length; i += languageConcurrency) {
		const currentBatch = targetLanguages.slice(i, i + languageConcurrency);
		const progressOptions = { logToConsole: false };

		const batchResults = await Promise.all(
			currentBatch.map((targetLang) => {
				const orchestrator = new Orchestrator({
					...options,
					concurrencyLimit: 1,
					progressOptions,
				});
				orchestrators.push(orchestrator);
				return processLanguage(
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

		await logBatchResults(batchResults);
	}

	// Store orchestrators in globalStats for later access
	globalStats.orchestrators = orchestrators;
}

/**
 * Log results for a batch of language processing
 */
async function logBatchResults(batchResults) {
	// Progress bar already shows the real-time status
	// Only show saved file confirmation
	for (const result of batchResults) {
		if (result && result.savedMessage) {
			await consoleLock.log(result.savedMessage);
		}
	}
}

/**
 * Finalize translation process and save state
 */
async function finalizeTranslation(
	stateManager,
	projectRoot,
	currentState,
	globalStats,
	startTime,
	options
) {
	globalStats.endTime = new Date().toISOString();
	globalStats.totalDuration = (Date.now() - startTime) / 1000;

	await displayGlobalSummary(globalStats, options.targets.length);

	// Save review queue if confidence scoring was enabled
	if (options.saveReviewQueue || options.minConfidence !== undefined) {
		if (globalStats.orchestrators && globalStats.orchestrators.length > 0) {
			// Collect all review queues from all orchestrators
			const allReviewItems = [];
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
			await consoleLock.log(`State saved for future sync operations`);
		}
	} catch (error) {
		await consoleLock.log(`Warning: Could not save state: ${error.message}`);
	}
}

/**
 * Main translator function to process source file and create translations
 */
async function translateFile(file, options) {
	await consoleLock.log(`\nProcessing File: "${path.basename(file)}"`);

	try {
		let resolvedFile = await validateTranslationInputs(file, options);

		const startTime = Date.now();
		const sourceContent = await FileManager.readJSON(resolvedFile);
		const flattenedSource = ObjectTransformer.flatten(sourceContent);
		const totalKeys = Object.keys(flattenedSource).length;

		await consoleLock.log(`Source file contains ${totalKeys} translation keys`);

		const { stateManager, projectRoot, currentState, comparison } =
			await initializeTranslationState(resolvedFile, flattenedSource, options);

		gracefulShutdown.registerCallback(async () => {
			try {
				await stateManager.saveState(projectRoot, currentState);
				console.log("State saved during shutdown");
			} catch (error) {
				console.error("Failed to save state during shutdown:", error.message);
			}
		});

		const globalStats = initializeGlobalStats();

		try {
			await processAllLanguages(
				resolvedFile,
				flattenedSource,
				options,
				globalStats,
				comparison
			);

			await finalizeTranslation(
				stateManager,
				projectRoot,
				currentState,
				globalStats,
				startTime,
				options
			);

			return globalStats;
		} catch (error) {
			await consoleLock.log(`\nTranslation error: ${error.message}`);

			globalStats.error = {
				message: error.message,
				time: new Date().toISOString(),
				stack: process.env.DEBUG ? error.stack : undefined,
			};

			throw error;
		} finally {
			if (process.env.DEBUG) {
				await consoleLock.log("\nCache statistics:");
			}
		}
	} catch (validationError) {
		await consoleLock.log(`\nInput validation error: ${validationError.message}`);
		throw validationError;
	}
}

/**
 * Process a single language translation
 */
async function processLanguage(
	targetLang,
	sourceFile,
	flattenedSource,
	orchestrator,
	options,
	globalStats,
	comparison
) {
	const langStartTime = Date.now();

	try {
		if (!targetLang || typeof targetLang !== "string") {
			throw new Error("Invalid target language provided");
		}
		if (!sourceFile || typeof sourceFile !== "string") {
			throw new Error("Invalid source file path provided");
		}
		if (!flattenedSource || typeof flattenedSource !== "object") {
			throw new Error("Invalid flattened source data provided");
		}
		if (!orchestrator || typeof orchestrator.processTranslations !== "function") {
			throw new Error("Invalid orchestrator instance provided");
		}
		if (!globalStats || typeof globalStats !== "object") {
			throw new Error("Invalid global stats object provided");
		}

		const safeTargetLang = InputValidator.validateLanguageCode(targetLang, "target language");

		await consoleLock.log(`Starting translations for ${safeTargetLang}`);
		let finalStatus = null;
		let savedMessage = null;

		globalStats.languages[safeTargetLang] = {
			processed: 0,
			added: 0,
			skipped: 0,
			failed: 0,
			timeMs: 0,
		};

		const sourceDir = path.dirname(sourceFile);
		const safeTargetFilename = `${safeTargetLang}.json`;
		const targetPath = InputValidator.createSafeFilePath(sourceDir, safeTargetFilename);

		let targetContent = {};
		try {
			targetContent = await FileManager.readJSON(targetPath);

			if (!targetContent || typeof targetContent !== "object") {
				console.warn(`Invalid content in ${targetPath}, using empty object`);
				targetContent = {};
			}
		} catch (err) {
			if (err.code === "ENOENT") {
				await consoleLock.log(
					`\ud83c\udd95 Creating new translation file for ${safeTargetLang}`
				);
			} else {
				if (options.debug) {
					console.warn(`Error reading ${targetPath}: ${err.message}, using empty object`);
				}
			}
			targetContent = {};
		}

		let flattenedTarget = {};
		try {
			flattenedTarget = ObjectTransformer.flatten(targetContent);
			if (!flattenedTarget || typeof flattenedTarget !== "object") {
				flattenedTarget = {};
			}
		} catch (err) {
			console.warn(`Error flattening target content: ${err.message}, using empty object`);
			flattenedTarget = {};
		}

		const missingKeys = [];
		let hasPlaceholderOnlyChanges = false;

		for (const [key, sourceText] of Object.entries(flattenedSource)) {
			try {
				InputValidator.validateKey(key, "translation key");
				InputValidator.validateText(sourceText, "source text");
			} catch (keyError) {
				await consoleLock.log(
					`\u26a0\ufe0f Skipping invalid key/text: ${keyError.message}`
				);
				globalStats.languages[safeTargetLang].failed++;
				globalStats.failed++;
				continue;
			}

			globalStats.languages[safeTargetLang].processed++;

			if (isPlaceholderOnlyText(sourceText)) {
				const existingValue = flattenedTarget[key];
				if (existingValue !== sourceText) {
					flattenedTarget[key] = sourceText;
					hasPlaceholderOnlyChanges = true;
					if (options.debug) {
						await consoleLock.log(`   Copying placeholder-only text: "${sourceText}"`);
					}
				}
				globalStats.languages[safeTargetLang].skipped++;
				globalStats.skipped++;
				continue;
			}

			const isNewKey = comparison.newKeys.includes(key);
			const isModifiedKey = comparison.modifiedKeys.includes(key);
			const keyExistsInTarget = key in flattenedTarget;

			if (keyExistsInTarget && !options.forceUpdate && !isModifiedKey) {
				globalStats.languages[safeTargetLang].skipped++;
				globalStats.skipped++;
				continue;
			}

			missingKeys.push({
				key,
				text: sourceText,
				targetLang: safeTargetLang,
				existingTranslation: flattenedTarget[key],
				isModified: isModifiedKey,
				isNew: isNewKey,
			});
		}

		if (missingKeys.length === 0 && !hasPlaceholderOnlyChanges) {
			await consoleLock.log(`All translations exist for ${safeTargetLang}`);
			globalStats.languages[safeTargetLang].timeMs = Date.now() - langStartTime;
			return { status: { completed: 0, total: 0, language: safeTargetLang } };
		}

		if (missingKeys.length > 0) {
			await consoleLock.log(
				`Found ${missingKeys.length} missing translations for ${safeTargetLang}`
			);
		}

		let results = [];
		if (missingKeys.length > 0) {
			try {
				results = await orchestrator.processTranslations(missingKeys);

				if (!Array.isArray(results)) {
					console.warn("Invalid results from orchestrator, using empty array");
					results = [];
				}
			} catch (err) {
				console.error(
					`Error processing translations for ${safeTargetLang}: ${err.message}`
				);
				results = [];

				if (globalStats.languages[safeTargetLang]) {
					globalStats.languages[safeTargetLang].failed += missingKeys.length;
					globalStats.failed += missingKeys.length;
				}
			}
		} else {
			if (hasPlaceholderOnlyChanges) {
				await consoleLock.log(`Found placeholder-only changes for ${safeTargetLang}`);
			}
		}

		try {
			if (orchestrator?.progress && typeof orchestrator.progress.getStatus === "function") {
				finalStatus = orchestrator.progress.getStatus();
			}
		} catch (err) {
			console.warn(`Error getting orchestrator status: ${err.message}`);
		}

		let validResults = [];
		try {
			validResults = results.filter((result) => result && result.success === true);

			validResults = validResults.filter(
				(result) =>
					result.key &&
					typeof result.key === "string" &&
					result.translated &&
					typeof result.translated === "string"
			);
		} catch (err) {
			console.warn(`Error filtering results: ${err.message}`);
			validResults = [];
		}

		if (validResults.length > 0) {
			validResults.forEach(({ key, translated }) => {
				flattenedTarget[key] = translated;
			});
		}

		const hasChangesToSave = validResults.length > 0 || hasPlaceholderOnlyChanges;

		if (hasChangesToSave) {
			const unflattened = ObjectTransformer.unflatten(flattenedTarget);
			await FileManager.writeJSON(targetPath, unflattened);

			globalStats.total += validResults.length;
			globalStats.success += validResults.length;
			globalStats.failed += results.length - validResults.length;
			globalStats.languages[safeTargetLang].added += validResults.length;
			globalStats.languages[safeTargetLang].failed += results.length - validResults.length;

			validResults.forEach((result) => {
				if (result.context) {
					const category = result.context.category || "general";
					globalStats.byCategory[category] = (globalStats.byCategory[category] || 0) + 1;

					if (!globalStats.details[category]) {
						globalStats.details[category] = {
							totalConfidence: 0,
							samples: 0,
						};
					}

					globalStats.details[category].totalConfidence += result.context.confidence || 0;
					globalStats.details[category].samples++;
				}
			});

			savedMessage = `\n\ud83d\udcbe Translations saved: ${safeTargetLang}.json`;
		}

		globalStats.languages[safeTargetLang].timeMs = Date.now() - langStartTime;
		return { status: finalStatus, savedMessage };
	} catch (error) {
		const safeError = error.message.includes("outside working directory")
			? "Invalid file path detected"
			: error.message;

		await consoleLock.log(`\n\u274c Error processing ${targetLang}: ${safeError}`);
		if (globalStats.languages[targetLang]) {
			globalStats.languages[targetLang].error = safeError;
			globalStats.languages[targetLang].timeMs = Date.now() - langStartTime;
		}
		return { status: null, error: safeError };
	}
}

/**
 * Validate and fix existing translations that have length issues
 */
async function validateAndFixExistingTranslations(file, options) {
	await consoleLock.log(`\nChecking existing translations in: "${path.basename(file)}"`);

	const sourceContent = await FileManager.readJSON(file);
	const flattenedSource = ObjectTransformer.flatten(sourceContent);
	const orchestrator = new Orchestrator(options);

	const languageResults = await Promise.all(
		options.targets.map(async (targetLang) => {
			try {
				const targetPath = path.join(path.dirname(file), `${targetLang}.json`);
				const targetContent = await FileManager.readJSON(targetPath);
				return { targetLang, targetPath, content: targetContent, success: true };
			} catch (err) {
				await consoleLock.log(`Could not read ${targetLang}.json: ${err.message}`);
				return { targetLang, success: false, error: err.message };
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
			rules: {
				lengthValidation: true,
				placeholderConsistency: false,
				htmlTagsConsistency: false,
				punctuationCheck: false,
			},
		});

		// Process languages sequentially to avoid overwhelming the API
		for (const langData of validLanguages) {
			const { targetLang, targetPath, content } = langData;
			const flattenedTarget = ObjectTransformer.flatten(content);
			const invalidItems = [];

			for (const [key, translatedText] of Object.entries(flattenedTarget)) {
				const sourceText = flattenedSource[key];
				if (!sourceText) continue;

				const checkResult = qualityChecker.validate(sourceText, translatedText, {
					...options,
					targetLang,
				});

				const lengthIssue = checkResult.issues.find((i) => i.type === "length");

				if (lengthIssue) {
					invalidItems.push({
						key,
						text: sourceText,
						targetLang,
						existingTranslation: translatedText,
						issueDetails: lengthIssue,
					});
				}
			}

			if (invalidItems.length > 0) {
				totalIssues += invalidItems.length;
				await consoleLock.log(
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

				await consoleLock.log(
					`Fixed ${fixedCount}/${invalidItems.length} translations in ${targetLang}`
				);
			} else {
				await consoleLock.log(`No length issues found in ${targetLang}`);
			}
		}

		if (totalIssues > 0) {
			await consoleLock.log(
				`\nFix Length Summary: Fixed ${totalFixed} of ${totalIssues} issues (${Math.round((totalFixed / totalIssues) * 100)}%)`
			);
		} else {
			await consoleLock.log(`\nNo length issues found in any language`);
		}
	} catch (error) {
		await consoleLock.log(`\nValidation error: ${error.message}`);
		throw error;
	}
}

/**
 * Display a summary of the translation results
 */
async function displayGlobalSummary(stats, totalLanguages) {
	await consoleLock.log("\n" + "=".repeat(60));
	await consoleLock.log("Global Translation Summary");
	await consoleLock.log("=".repeat(60));

	await consoleLock.log(`\nLanguages Processed: ${totalLanguages}`);
	await consoleLock.log(`Total Translations: ${stats.total}`);
	await consoleLock.log(`Success: ${stats.success}`);
	await consoleLock.log(`Failed: ${stats.failed}`);
	await consoleLock.log(`Skipped: ${stats.skipped}`);
	await consoleLock.log(`Total Time: ${stats.totalTime.toFixed(1)}s`);
	await consoleLock.log(
		`Average per language: ${(stats.totalTime / totalLanguages).toFixed(1)}s`
	);

	// Display detailed language stats
	if (Object.keys(stats.languages).length > 0) {
		await consoleLock.log("\n" + "-".repeat(60));
		await consoleLock.log("Per-language Performance:");
		await consoleLock.log("-".repeat(60));
		for (const [lang, langStats] of Object.entries(stats.languages)) {
			const timeSeconds = langStats.timeMs / 1000;
			await consoleLock.log(
				`  ${lang.padEnd(4)} | ${String(langStats.added).padStart(3)} added | ${String(langStats.skipped).padStart(3)} skipped | ${String(langStats.failed).padStart(2)} failed | ${timeSeconds.toFixed(1)}s`
			);
		}
	}

	// Only show categories if we have them
	if (Object.keys(stats.byCategory).length > 0) {
		await consoleLock.log("\n" + "-".repeat(60));
		await consoleLock.log("Context Analysis by Category:");
		await consoleLock.log("-".repeat(60));
		for (const [category, count] of Object.entries(stats.byCategory)) {
			const details = stats.details[category];
			if (details && details.samples > 0) {
				const avgConfidence = details.totalConfidence / details.samples;
				const confidenceStr = `${(avgConfidence * 100).toFixed(1)}%`;
				await consoleLock.log(
					`  ${category}: ${count} items (${confidenceStr} avg confidence)`
				);
			} else {
				await consoleLock.log(`  ${category}: ${count} items`);
			}
		}
	}

	// Clear completion message - only once
	await consoleLock.log("\n" + "=".repeat(60));
	await consoleLock.log(
		`All operations completed successfully in ${stats.totalDuration.toFixed(1)}s`
	);
	await consoleLock.log("=".repeat(60) + "\n");
}

/**
 * Find locale files based on source language
 */
async function findLocaleFiles(localesDir, sourceLang) {
	try {
		return await FileManager.findLocaleFiles(localesDir, sourceLang);
	} catch (error) {
		await consoleLock.log(`Error finding locale files: ${error.message}`);
		return [];
	}
}

/**
 * Create backup of locale files before sync
 * @param {string} sourceFile - Path to source file
 * @param {Object} options - Configuration options
 */
async function createSyncBackup(sourceFile, options) {
	const sourceDir = path.dirname(sourceFile);
	const backupDir =
		options.syncOptions?.backupDir || options.fileOperations?.backupDir || "./backups";
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = path.join(backupDir, `sync-backup-${timestamp}`);

	try {
		// Create backup directory
		await FileManager.ensureDirectoryExists(backupPath);

		// Backup source file
		const sourceFilename = path.basename(sourceFile);
		const sourceBackupPath = path.join(backupPath, sourceFilename);
		const fs = await import("fs/promises");
		await fs.default.copyFile(sourceFile, sourceBackupPath);

		// Backup all target files
		let backedUpCount = 1; // source file
		for (const targetLang of options.targets) {
			try {
				const safeTargetFilename = `${targetLang}.json`;
				const targetPath = InputValidator.createSafeFilePath(sourceDir, safeTargetFilename);
				const targetBackupPath = path.join(backupPath, safeTargetFilename);

				const fileExists = await FileManager.exists(targetPath);
				if (fileExists) {
					await fs.default.copyFile(targetPath, targetBackupPath);
					backedUpCount++;
				}
			} catch (error) {
				// Continue even if one file fails
			}
		}

		await consoleLock.log(`   Backup created: ${backupPath} (${backedUpCount} files)`);
	} catch (error) {
		await consoleLock.log(`   Warning: Backup failed: ${error.message}`);
	}
}

/**
 * Remove deleted keys from all target language files
 * @param {string} sourceFile - Path to source file
 * @param {string[]} deletedKeys - Array of keys to remove
 * @param {Object} options - Configuration options
 */
async function removeDeletedKeysFromTargets(sourceFile, deletedKeys, options) {
	const sourceDir = path.dirname(sourceFile);
	let totalRemoved = 0;
	let filesProcessed = 0;

	for (const targetLang of options.targets) {
		try {
			const safeTargetFilename = `${targetLang}.json`;
			const targetPath = InputValidator.createSafeFilePath(sourceDir, safeTargetFilename);

			// Check if target file exists
			const fileExists = await FileManager.exists(targetPath);
			if (!fileExists) {
				await consoleLock.log(`   Skipping ${targetLang}.json (file doesn't exist)`);
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
				await consoleLock.log(`   ${targetLang}.json: Removed ${removedFromThisFile} keys`);
			} else {
				await consoleLock.log(`   No keys to remove from ${targetLang}.json`);
			}

			filesProcessed++;
		} catch (error) {
			await consoleLock.log(
				`   \u274c Error processing ${targetLang}.json: ${error.message}`
			);
		}
	}

	await consoleLock.log(
		`Cleanup Summary: Removed ${totalRemoved} keys from ${filesProcessed} files\n`
	);
}

export { findLocaleFiles, translateFile, validateAndFixExistingTranslations };
