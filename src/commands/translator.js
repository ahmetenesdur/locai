import translationService from "../services/translation-service.js";

/**
 * Main translator function to process source file and create translations.
 * @param {string} file - Source file path.
 * @param {Object} options - Translation options.
 * @returns {Promise<Object>} - Translation result.
 */
async function translateFile(file, options) {
	return await translationService.translateFile(file, options);
}

/**
 * Find locale files based on source language.
 * @param {string} localesDir - Locales directory.
 * @param {string} sourceLang - Source language code.
 * @returns {Promise<Array<string>>} - Array of locale file paths.
 */
async function findLocaleFiles(localesDir, sourceLang) {
	return await translationService.findLocaleFiles(localesDir, sourceLang);
}

/**
 * Validate and fix existing translations that have length issues.
 * @param {string} file - File path to validate.
 * @param {Object} options - Validation options.
 * @returns {Promise<Object>} - Validation result.
 */
async function validateAndFixExistingTranslations(file, options) {
	return await translationService.validateAndFixExistingTranslations(file, options);
}

export { translateFile, findLocaleFiles, validateAndFixExistingTranslations };
