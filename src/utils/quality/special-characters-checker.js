/**
 * Special Characters Preservation Checker
 * Ensures special characters, symbols, and formatting are preserved
 */

class SpecialCharactersChecker {
	constructor() {
		// Define categories of special characters to preserve
		this.specialCharacterSets = {
			// Currency symbols
			currency: /[$€£¥₹₽¢]/g,
			// Math symbols
			math: /[+\-×÷=≠<>≤≥±∞√∑∏]/g,
			// Arrows
			arrows: /[←→↑↓↔↕⇐⇒⇑⇓⇔]/g,
			// Bullets and markers
			bullets: /[•·●○◆◇■□▪▫]/g,
			// Quotes and apostrophes
			quotes: /[""''«»‹›]/g,
			// Dashes and hyphens
			dashes: /[–—−]/g,
			// Special punctuation
			punctuation: /[¿¡‽…]/g,
			// Trademark and copyright
			legal: /[©®™℠]/g,
			// Fractions
			fractions: /[¼½¾⅓⅔⅛⅜⅝⅞]/g,
			// Degree and temperature
			measurements: /[°℃℉]/g,
		};

		// Characters that should never be translated
		this.criticalCharacters = [
			...Array.from("$€£¥₹₽¢"),
			...Array.from("©®™℠"),
			...Array.from("°℃℉"),
		];
	}

	/**
	 * Check if special characters are preserved
	 */
	checkSpecialCharacters(sourceText, translatedText) {
		const issues = [];

		// Check each category of special characters
		for (const [category, pattern] of Object.entries(this.specialCharacterSets)) {
			const sourceMatches = sourceText.match(pattern) || [];
			const translatedMatches = translatedText.match(pattern) || [];

			if (sourceMatches.length !== translatedMatches.length) {
				issues.push({
					type: "special-characters",
					category,
					severity: this.criticalCharacters.some((char) => sourceMatches.includes(char))
						? "error"
						: "warning",
					message: `${category} character count mismatch: source has ${sourceMatches.length}, translation has ${translatedMatches.length}`,
					details: {
						sourceChars: sourceMatches,
						translatedChars: translatedMatches,
						missing: sourceMatches.filter((char) => !translatedMatches.includes(char)),
						extra: translatedMatches.filter((char) => !sourceMatches.includes(char)),
					},
				});
			}

			// Check for character substitutions (e.g., " to ")
			const sourceUniqueChars = new Set(sourceMatches);
			const translatedUniqueChars = new Set(translatedMatches);

			for (const char of sourceUniqueChars) {
				if (!translatedUniqueChars.has(char)) {
					issues.push({
						type: "special-character-substitution",
						category,
						severity: "warning",
						message: `Special character "${char}" was replaced or removed`,
						details: {
							originalChar: char,
							charCode: char.charCodeAt(0),
						},
					});
				}
			}
		}

		// Check for emoji preservation
		const emojiIssues = this.checkEmojiPreservation(sourceText, translatedText);
		issues.push(...emojiIssues);

		return issues;
	}

	/**
	 * Check emoji preservation
	 */
	checkEmojiPreservation(sourceText, translatedText) {
		const issues = [];

		// Emoji regex pattern
		const emojiPattern =
			/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

		const sourceEmojis = sourceText.match(emojiPattern) || [];
		const translatedEmojis = translatedText.match(emojiPattern) || [];

		if (sourceEmojis.length !== translatedEmojis.length) {
			issues.push({
				type: "emoji-preservation",
				severity: "warning",
				message: `Emoji count mismatch: source has ${sourceEmojis.length}, translation has ${translatedEmojis.length}`,
				details: {
					sourceEmojis,
					translatedEmojis,
				},
			});
		}

		return issues;
	}

	/**
	 * Fix special character issues
	 */
	fixSpecialCharacters(sourceText, translatedText) {
		let fixedText = translatedText;
		const foundIssues = [];
		const appliedFixes = [];

		// Extract special characters from source
		const sourceSpecialChars = this.extractSpecialCharacters(sourceText);

		// Check what's missing in translation
		const translatedSpecialChars = this.extractSpecialCharacters(translatedText);

		// Find missing critical characters
		for (const [category, chars] of Object.entries(sourceSpecialChars)) {
			const missingChars = chars.filter(
				(char) => !translatedSpecialChars[category]?.includes(char)
			);

			if (missingChars.length > 0) {
				foundIssues.push({
					type: "missing-special-chars",
					category,
					message: `Missing ${missingChars.length} ${category} characters`,
				});

				// Try to restore critical characters
				if (this.criticalCharacters.some((critical) => missingChars.includes(critical))) {
					const result = this.restoreCriticalCharacters(
						sourceText,
						fixedText,
						missingChars
					);
					fixedText = result.text;
					appliedFixes.push(...result.appliedFixes);
				}
			}
		}

		// Fix common character substitutions
		const substitutionResult = this.fixCommonSubstitutions(sourceText, fixedText);
		fixedText = substitutionResult.text;
		foundIssues.push(...substitutionResult.foundIssues);
		appliedFixes.push(...substitutionResult.appliedFixes);

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Extract special characters by category
	 */
	extractSpecialCharacters(text) {
		const extracted = {};

		for (const [category, pattern] of Object.entries(this.specialCharacterSets)) {
			const matches = text.match(pattern) || [];
			extracted[category] = matches;
		}

		return extracted;
	}

	/**
	 * Restore critical characters that were lost
	 */
	restoreCriticalCharacters(sourceText, translatedText, missingChars) {
		const appliedFixes = [];
		let fixedText = translatedText;

		// This is a simplified restoration
		// In practice, we'd need context to know where to place the characters

		for (const char of missingChars) {
			if (this.criticalCharacters.includes(char)) {
				// Find where this character appears in source
				const sourceIndex = sourceText.indexOf(char);

				if (sourceIndex !== -1) {
					appliedFixes.push({
						type: "critical-char-restore",
						message: `Noted missing critical character: "${char}"`,
					});

					// Note: Full restoration would require AI to determine placement
				}
			}
		}

		return { text: fixedText, appliedFixes };
	}

	/**
	 * Fix common character substitutions
	 */
	fixCommonSubstitutions(sourceText, translatedText) {
		const foundIssues = [];
		const appliedFixes = [];
		let fixedText = translatedText;

		// Common problematic substitutions
		const substitutions = [
			// Smart quotes to regular quotes (and vice versa)
			{ wrong: '"', correct: '"', check: sourceText.includes('"') },
			{ wrong: '"', correct: '"', check: sourceText.includes('"') },
			{ wrong: "'", correct: "'", check: sourceText.includes("'") },
			{ wrong: "'", correct: "'", check: sourceText.includes("'") },
			// Dashes
			{ wrong: "-", correct: "–", check: sourceText.includes("–") },
			{ wrong: "-", correct: "—", check: sourceText.includes("—") },
			// Ellipsis
			{ wrong: "...", correct: "…", check: sourceText.includes("…") },
		];

		for (const { wrong, correct, check } of substitutions) {
			if (check && fixedText.includes(wrong)) {
				const count = (fixedText.match(new RegExp(wrong, "g")) || []).length;

				foundIssues.push({
					type: "character-substitution",
					message: `Found ${count} instances of "${wrong}" that should be "${correct}"`,
				});

				fixedText = fixedText.replace(new RegExp(wrong, "g"), correct);

				appliedFixes.push({
					type: "character-substitution",
					message: `Replaced "${wrong}" with "${correct}" (${count} instances)`,
				});
			}
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Check if text has special characters
	 */
	hasSpecialCharacters(text) {
		for (const pattern of Object.values(this.specialCharacterSets)) {
			if (pattern.test(text)) {
				return true;
			}
		}
		return false;
	}
}

export default SpecialCharactersChecker;
