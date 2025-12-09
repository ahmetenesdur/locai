/**
 * HTML Tag Consistency Checker.
 * Ensures HTML tags are preserved and correctly nested in translations.
 */
class HtmlTagChecker {
	/**
	 * Check for HTML tag mismatches between source and translation.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Array<Object>} - Array of HTML tag issues.
	 */
	checkHtmlTags(source, translated) {
		const tagRegex = /<[^>]+>/g;
		const sourceTags = source.match(tagRegex) || [];
		const translatedTags = translated.match(tagRegex) || [];

		if (sourceTags.length !== translatedTags.length) {
			return [
				{
					type: "htmlTag",
					message: "HTML tag count mismatch",
					source: sourceTags,
					translated: translatedTags,
				},
			];
		}
		return [];
	}

	/**
	 * Fix missing HTML tags in translated text.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Object} - Result with fixed text, issues, and applied fixes.
	 */
	fixHtmlTags(source, translated) {
		const tagRegex = /<[^>]+>/g;
		const sourceTags = source.match(tagRegex) || [];
		let fixedText = translated;
		const foundIssues = [];
		const appliedFixes = [];

		sourceTags.forEach((tag) => {
			if (!fixedText.includes(tag)) {
				foundIssues.push({
					type: "htmlTag",
					message: `Missing HTML tag: ${tag}`,
				});

				fixedText = this.insertHtmlTag(fixedText, tag);
				appliedFixes.push({
					type: "htmlTag",
					message: `Added HTML tag: ${tag}`,
				});
			}
		});

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Insert HTML tag into text.
	 * @param {string} text - Text to modify.
	 * @param {string} tag - Tag to insert.
	 * @returns {string} - Modified text.
	 */
	insertHtmlTag(text, tag) {
		const isClosingTag = tag.startsWith("</");
		if (isClosingTag) {
			const openingTag = tag.replace("/", "");
			const position = text.indexOf(openingTag) + openingTag.length;
			return text.slice(0, position) + tag + text.slice(position);
		}
		return tag + text;
	}
}

export default HtmlTagChecker;
