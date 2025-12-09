/**
 * Style Guide Checker.
 * Enforces style guide conventions like Oxford comma and sentence case.
 */
class StyleGuideChecker {
	constructor(styleGuide = {}) {
		this.styleGuide = {
			formality: styleGuide.formality || "neutral",
			toneOfVoice: styleGuide.toneOfVoice || "professional",
			conventions: {
				useOxfordComma: styleGuide.conventions?.useOxfordComma !== false,
				useSentenceCase: styleGuide.conventions?.useSentenceCase !== false,
				...styleGuide.conventions,
			},
		};
	}

	/**
	 * Check if text follows style guide conventions.
	 * @param {string} sourceText - Source text.
	 * @param {string} translatedText - Translated text.
	 * @returns {Array<Object>} - Array of found issues.
	 */
	checkStyleGuide(sourceText, translatedText) {
		const issues = [];

		if (this.styleGuide.conventions.useOxfordComma) {
			const oxfordIssues = this.checkOxfordComma(translatedText);
			issues.push(...oxfordIssues);
		}

		if (this.styleGuide.conventions.useSentenceCase) {
			const sentenceCaseIssues = this.checkSentenceCase(translatedText);
			issues.push(...sentenceCaseIssues);
		}

		return issues;
	}

	/**
	 * Check for Oxford comma usage in lists.
	 * @param {string} text - Text to check.
	 * @returns {Array<Object>} - Array of found issues.
	 */
	checkOxfordComma(text) {
		const issues = [];

		// Pattern: word, word and word (missing Oxford comma)
		// Should be: word, word, and word
		const listPattern = /(\w+),\s+(\w+)\s+(?:and|or)\s+(\w+)/gi;
		const matches = text.matchAll(listPattern);

		for (const match of matches) {
			const fullMatch = match[0];
			// Check if there's already a comma before 'and/or'
			if (!fullMatch.match(/,\s+(?:and|or)/)) {
				issues.push({
					type: "oxford-comma",
					severity: "warning",
					message: `Missing Oxford comma in list: "${fullMatch}"`,
					suggestion: fullMatch.replace(/(\w+)\s+(and|or)/, "$1, $2"),
				});
			}
		}

		return issues;
	}

	/**
	 * Check sentence case for headings/titles.
	 * @param {string} text - Text to check.
	 * @returns {Array<Object>} - Array of found issues.
	 */
	checkSentenceCase(text) {
		const issues = [];

		// Check for potential headings (short lines with multiple capital letters)
		const lines = text.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines and very long lines (likely not headings)
			if (!trimmed || trimmed.length > 100) continue;

			// Check if line looks like a title (multiple consecutive capitals)
			const allCapsPattern = /^[A-Z\s]+$/;

			if (allCapsPattern.test(trimmed) && trimmed.length > 5) {
				issues.push({
					type: "sentence-case",
					severity: "info",
					message: `All caps heading detected: "${trimmed}"`,
					suggestion: this.convertToSentenceCase(trimmed),
				});
			}
		}

		return issues;
	}

	/**
	 * Fix style guide issues.
	 * @param {string} sourceText - Source text.
	 * @param {string} translatedText - Translated text.
	 * @returns {Object} - Result with fixed text, issues, and fixes.
	 */
	fixStyleGuide(sourceText, translatedText) {
		let fixedText = translatedText;
		const foundIssues = [];
		const appliedFixes = [];

		if (this.styleGuide.conventions.useOxfordComma) {
			const result = this.fixOxfordComma(fixedText);
			fixedText = result.text;
			foundIssues.push(...result.foundIssues);
			appliedFixes.push(...result.appliedFixes);
		}

		if (this.styleGuide.conventions.useSentenceCase) {
			const result = this.fixSentenceCase(fixedText);
			fixedText = result.text;
			foundIssues.push(...result.foundIssues);
			appliedFixes.push(...result.appliedFixes);
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Fix missing Oxford commas.
	 * @param {string} text - Text to fix.
	 * @returns {Object} - Result with fixed text, issues, and fixes.
	 */
	fixOxfordComma(text) {
		const foundIssues = [];
		const appliedFixes = [];
		let fixedText = text;

		// Pattern: word, word and word -> word, word, and word
		const listPattern = /(\w+),\s+(\w+)\s+(and|or)\s+(\w+)/gi;

		fixedText = fixedText.replace(listPattern, (match, word1, word2, conjunction, word3) => {
			// Check if comma already exists before conjunction
			if (!match.includes(`, ${conjunction}`)) {
				foundIssues.push({
					type: "oxford-comma",
					message: `Missing Oxford comma: "${match}"`,
				});

				appliedFixes.push({
					type: "oxford-comma",
					message: `Added Oxford comma before "${conjunction}"`,
				});

				return `${word1}, ${word2}, ${conjunction} ${word3}`;
			}
			return match;
		});

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Fix sentence case issues.
	 * @param {string} text - Text to fix.
	 * @returns {Object} - Result with fixed text, issues, and fixes.
	 */
	fixSentenceCase(text) {
		const foundIssues = [];
		const appliedFixes = [];
		const lines = text.split("\n");
		const fixedLines = [];

		for (const line of lines) {
			const trimmed = line.trim();

			// Check for all caps headings
			const allCapsPattern = /^[A-Z\s]+$/;
			if (allCapsPattern.test(trimmed) && trimmed.length > 5 && trimmed.length < 100) {
				foundIssues.push({
					type: "sentence-case",
					message: `All caps heading: "${trimmed}"`,
				});

				const sentenceCase = this.convertToSentenceCase(trimmed);
				fixedLines.push(line.replace(trimmed, sentenceCase));

				appliedFixes.push({
					type: "sentence-case",
					message: `Converted to sentence case: "${trimmed}" → "${sentenceCase}"`,
				});
			} else {
				fixedLines.push(line);
			}
		}

		return {
			text: fixedLines.join("\n"),
			foundIssues,
			appliedFixes,
		};
	}

	/**
	 * Convert text to sentence case.
	 * @param {string} text - Text to convert.
	 * @returns {string} - Converted text.
	 */
	convertToSentenceCase(text) {
		// Capitalize first letter, lowercase the rest
		// But preserve acronyms (2-3 letter all-caps words)
		const words = text.split(/\s+/);

		return words
			.map((word, index) => {
				// Keep short all-caps words (likely acronyms)
				if (word.length <= 3 && word === word.toUpperCase()) {
					return word;
				}

				// First word gets capital
				if (index === 0) {
					return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
				}

				// Rest are lowercase (unless acronyms)
				return word.toLowerCase();
			})
			.join(" ");
	}
}

export default StyleGuideChecker;
