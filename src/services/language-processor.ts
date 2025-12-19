import path from "path";
import { FileManager } from "../utils/file-manager.js";
import ObjectTransformer from "../utils/object-transformer.js";
import Orchestrator from "../core/orchestrator.js";
import InputValidator from "../utils/input-validator.js";
import uiManager from "../utils/ui-manager.js";
import statisticsManager from "../utils/statistics-manager.js";
import { TranslationResult } from "../core/pipeline/context.js";
import {
	TranslationOptions,
	GlobalStats,
	MissingKey,
	LanguageProcessResult,
} from "../types/index.js";

export class LanguageProcessor {
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
	static async processLanguage(
		targetLang: string,
		sourceFile: string,
		flattenedSource: Record<string, any>,
		orchestrator: Orchestrator,
		options: TranslationOptions,
		globalStats: GlobalStats,
		comparison: any
	): Promise<LanguageProcessResult> {
		if (!targetLang) {
			throw new Error("Invalid target language provided");
		}
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

			const safeTargetLang = InputValidator.validateLanguageCode(
				targetLang,
				"target language"
			);

			await uiManager.log(`Starting translations for ${safeTargetLang}`);
			let finalStatus = null;
			let savedMessage = undefined;

			statisticsManager.initLanguageStats(safeTargetLang);

			const sourceDir = path.dirname(sourceFile);
			const safeTargetFilename = `${safeTargetLang}.json`;
			const targetPath = InputValidator.createSafeFilePath(sourceDir, safeTargetFilename);

			let targetContent: Record<string, any> = {};
			try {
				targetContent = await FileManager.readJSON(targetPath);

				if (!targetContent || typeof targetContent !== "object") {
					console.warn(`Invalid content in ${targetPath}, using empty object`);
					targetContent = {};
				}
			} catch (err: any) {
				if (err.code === "ENOENT") {
					await uiManager.log(
						`\ud83c\udd95 Creating new translation file for ${safeTargetLang}`
					);
				} else {
					if (options.debug) {
						console.warn(
							`Error reading ${targetPath}: ${err.message}, using empty object`
						);
					}
				}
				targetContent = {};
			}

			let flattenedTarget: Record<string, any> = {};
			try {
				flattenedTarget = ObjectTransformer.flatten(targetContent);
				if (!flattenedTarget || typeof flattenedTarget !== "object") {
					flattenedTarget = {};
				}
			} catch (err: any) {
				console.warn(`Error flattening target content: ${err.message}, using empty object`);
				flattenedTarget = {};
			}

			const missingKeys: MissingKey[] = [];
			let hasPlaceholderOnlyChanges = false;

			for (const [key, sourceText] of Object.entries(flattenedSource)) {
				try {
					InputValidator.validateKey(key, "translation key");
					InputValidator.validateText(sourceText, "source text");
				} catch (keyError: any) {
					await uiManager.log(
						`\u26a0\ufe0f Skipping invalid key/text: ${keyError.message}`
					);
					globalStats.languages[safeTargetLang].failed++;
					globalStats.failed++;
					continue;
				}

				globalStats.languages[safeTargetLang].processed++;

				if (this.isPlaceholderOnlyText(sourceText)) {
					const existingValue = flattenedTarget[key];
					if (existingValue !== sourceText) {
						flattenedTarget[key] = sourceText;
						hasPlaceholderOnlyChanges = true;
						if (options.debug) {
							await uiManager.log(
								`   Copying placeholder-only text: "${sourceText}"`
							);
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
				await uiManager.log(`All translations exist for ${safeTargetLang}`);
				globalStats.languages[safeTargetLang].timeMs = Date.now() - langStartTime;
				return { status: { completed: 0, total: 0, language: safeTargetLang } };
			}

			if (missingKeys.length > 0) {
				await uiManager.log(
					`Found ${missingKeys.length} missing translations for ${safeTargetLang}`
				);
			}

			let results: TranslationResult[] = [];
			if (missingKeys.length > 0) {
				try {
					results = await orchestrator.processTranslations(missingKeys);

					if (!Array.isArray(results)) {
						console.warn("Invalid results from orchestrator, using empty array");
						results = [];
					}
				} catch (err: any) {
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
					await uiManager.log(`Found placeholder-only changes for ${safeTargetLang}`);
				}
			}

			try {
				if (
					orchestrator?.progress &&
					typeof orchestrator.progress.getStatus === "function"
				) {
					finalStatus = orchestrator.progress.getStatus();
				}
			} catch (err: any) {
				console.warn(`Error getting orchestrator status: ${err.message}`);
			}

			let validResults: TranslationResult[] = [];
			try {
				validResults = results.filter((result) => result && result.success === true);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				validResults = validResults.filter(
					(result: any) =>
						result.key &&
						typeof result.key === "string" &&
						result.translated &&
						typeof result.translated === "string"
				);
			} catch (err: any) {
				console.warn(`Error filtering results: ${err.message}`);
				validResults = [];
			}

			if (validResults.length > 0) {
				validResults.forEach(({ key, translated }) => {
					if (translated) {
						flattenedTarget[key] = translated;
					}
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
				globalStats.languages[safeTargetLang].failed +=
					results.length - validResults.length;

				validResults.forEach((result) => {
					if (result.context) {
						const category = result.context.category || "general";
						globalStats.byCategory[category] =
							(globalStats.byCategory[category] || 0) + 1;

						if (!globalStats.details[category]) {
							globalStats.details[category] = {
								totalConfidence: 0,
								samples: 0,
							};
						}

						globalStats.details[category].totalConfidence +=
							result.context.confidence || 0;
						globalStats.details[category].samples++;
					}
				});

				savedMessage = `Translations saved: ${safeTargetLang}.json`;
			}

			globalStats.languages[safeTargetLang].timeMs = Date.now() - langStartTime;
			return { status: finalStatus, savedMessage };
		} catch (error: any) {
			const safeError = error.message.includes("outside working directory")
				? "Invalid file path detected"
				: error.message;

			await uiManager.log(`\n\u274c Error processing ${targetLang}: ${safeError}`);
			if (globalStats.languages[targetLang]) {
				globalStats.languages[targetLang].error = safeError;
				globalStats.languages[targetLang].timeMs = Date.now() - langStartTime;
			}
			return { status: null, error: safeError };
		}
	}

	/**
	 * Check if text only contains placeholders and whitespace.
	 * @param {string} text - Text to check.
	 * @returns {boolean} - True if text only contains placeholders.
	 */
	static isPlaceholderOnlyText(text: string): boolean {
		if (!text || typeof text !== "string") {
			return false;
		}
		// Remove all placeholders from the text
		const placeholderRegex = /\{[^}]+\}|\$\{[^}]+\}|%[sd]/g;
		const textWithoutPlaceholders = text.replace(placeholderRegex, "").trim();

		return textWithoutPlaceholders.length === 0;
	}
}
