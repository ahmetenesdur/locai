import translationService, { FixSummary } from "../services/translation-service.js";
import { GlobalStats, TranslationOptions } from "../types/index.js";

export type { FixSummary };

/**
 * Main translator function to process source file and create translations.
 * @param {string} file - Source file path.
 * @param {TranslationOptions} options - Translation options.
 * @returns {Promise<GlobalStats>} - Translation result.
 */
async function translateFile(file: string, options: TranslationOptions): Promise<GlobalStats> {
	return await translationService.translateFile(file, options);
}

/**
 * Find locale files based on source language.
 * @param {string} localesDir - Locales directory.
 * @param {string} sourceLang - Source language code.
 * @returns {Promise<Array<string>>} - Array of locale file paths.
 */
async function findLocaleFiles(localesDir: string, sourceLang: string): Promise<string[]> {
	return await translationService.findLocaleFiles(localesDir, sourceLang);
}

/**
 * Validate and fix existing translations that have length issues.
 * @param {string} file - File path to validate.
 * @param {TranslationOptions} options - Validation options.
 * @returns {Promise<FixSummary>} - How many length issues were found and fixed.
 */
async function validateAndFixExistingTranslations(
	file: string,
	options: TranslationOptions
): Promise<FixSummary> {
	return await translationService.validateAndFixExistingTranslations(file, options);
}

export { translateFile, findLocaleFiles, validateAndFixExistingTranslations };
