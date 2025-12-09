/**
 * Punctuation Consistency Checker.
 * Ensures end punctuation marks are preserved in translation.
 */
class PunctuationChecker {
	/**
	 * Check for punctuation mismatches.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Array<Object>} - Array of punctuation issues.
	 */
	checkPunctuation(source, translated) {
		const issues = [];
		const endPunctuation = /[.!?]$/;

		if (source.match(endPunctuation) && !translated.match(endPunctuation)) {
			issues.push({
				type: "punctuation",
				message: "Missing punctuation mark",
			});
		}

		return issues;
	}

	/**
	 * Fix missing punctuation marks.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Object} - Result with fixed text, issues, and fixes.
	 */
	fixPunctuation(source, translated) {
		const endPunctuation = /[.!?]$/;
		let fixedText = translated;
		const foundIssues = [];
		const appliedFixes = [];

		const sourceEndsWithPunctuation = source.match(endPunctuation);
		const translatedEndsWithPunctuation = translated.match(endPunctuation);

		if (sourceEndsWithPunctuation && !translatedEndsWithPunctuation) {
			foundIssues.push({
				type: "punctuation",
				message: "Missing punctuation mark",
			});

			fixedText = this.addPunctuation(fixedText, sourceEndsWithPunctuation[0]);
			appliedFixes.push({
				type: "punctuation",
				message: `Added punctuation mark: ${sourceEndsWithPunctuation[0]}`,
			});
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Add punctuation to the end of text.
	 * @param {string} text - Text to modify.
	 * @param {string} punctuation - Punctuation mark to add.
	 * @returns {string} - Modified text.
	 */
	addPunctuation(text, punctuation) {
		return text.trim() + punctuation;
	}
}

export default PunctuationChecker;
