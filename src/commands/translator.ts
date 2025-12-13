import translationService from "../services/translation-service.js";
import { TranslationOptions, GlobalStats } from "../services/translation-service.js";

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
 * @returns {Promise<void>}
 */
async function validateAndFixExistingTranslations(
	file: string,
	options: TranslationOptions
): Promise<void> {
	return await translationService.validateAndFixExistingTranslations(file, options);
}

export { translateFile, findLocaleFiles, validateAndFixExistingTranslations };
