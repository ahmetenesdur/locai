/**
 * @typedef {Object} TranslationContext
 * @property {string} key - The translation key
 * @property {string} sourceText - Original text
 * @property {string} sourceLang - Source language code
 * @property {string} targetLang - Target language code
 * @property {Object} [meta] - Metadata (category, detection results, etc.)
 * @property {Object} [existingTranslation] - Previous translation for reference
 * @property {Object} options - Global configuration options
 *
 * @property {string} [protectedText] - Text with glossary terms replaced
 * @property {Map} [termMap] - Map of protected terms
 * @property {string} [translatedText] - The result text
 * @property {Object} result - Final result object structure
 *
 * @property {boolean} success - Operation success status
 * @property {string} [error] - Error message if failed
 * @property {boolean} fromCache - Whether result came from cache
 */

export const createTranslationContext = (
	key,
	sourceText,
	sourceLang,
	targetLang,
	options,
	meta = {},
	existingTranslation = null
) => ({
	key,
	sourceText,
	sourceLang,
	targetLang,
	options,
	meta,
	existingTranslation,
	result: {
		key,
		translated: null,
		success: false,
		context: meta,
	},
});
