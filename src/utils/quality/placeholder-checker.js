/**
 * Placeholder Consistency Checker.
 * Ensures placeholders like {name}, ${value}, %s are preserved correctly.
 */
class PlaceholderChecker {
	/**
	 * Check for placeholder mismatches or corruptions.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Array<Object>} - Array of placeholder issues.
	 */
	checkPlaceholders(source, translated) {
		const placeholderRegex = /\{[^}]+\}|\$\{[^}]+\}|%[sd]/g;
		const sourcePlaceholders = source.match(placeholderRegex) || [];
		const translatedPlaceholders = translated.match(placeholderRegex) || [];

		const issues = [];

		// Check for missing or extra placeholders
		if (sourcePlaceholders.length !== translatedPlaceholders.length) {
			issues.push({
				type: "placeholder",
				message: "Placeholder count mismatch",
				source: sourcePlaceholders,
				translated: translatedPlaceholders,
			});
		}

		// Check for corrupted placeholders (placeholders that were translated/modified)
		for (const sourcePlaceholder of sourcePlaceholders) {
			if (!translated.includes(sourcePlaceholder)) {
				// Look for potential corrupted versions
				const corruptedPattern = this.findCorruptedPlaceholder(
					translated,
					sourcePlaceholder
				);
				if (corruptedPattern) {
					issues.push({
						type: "placeholder",
						message: `Corrupted placeholder detected: expected '${sourcePlaceholder}' but found '${corruptedPattern}'`,
						source: sourcePlaceholder,
						corrupted: corruptedPattern,
					});
				} else {
					issues.push({
						type: "placeholder",
						message: `Missing placeholder: ${sourcePlaceholder}`,
						source: sourcePlaceholder,
					});
				}
			}
		}

		return issues;
	}

	/**
	 * Fix corrupted or missing placeholders in translated text.
	 * @param {string} source - Source text.
	 * @param {string} translated - Translated text.
	 * @returns {Object} - Result with fixed text, issues, and applied fixes.
	 */
	fixPlaceholders(source, translated) {
		const placeholderRegex = /\{[^}]+\}|\$\{[^}]+\}|%[sd]/g;
		const sourcePlaceholders = source.match(placeholderRegex) || [];
		let fixedText = translated;
		const foundIssues = [];
		const appliedFixes = [];

		// First, fix corrupted placeholders
		for (const sourcePlaceholder of sourcePlaceholders) {
			if (!fixedText.includes(sourcePlaceholder)) {
				// Try to find and fix corrupted versions
				const corruptedPattern = this.findCorruptedPlaceholder(
					fixedText,
					sourcePlaceholder
				);
				if (corruptedPattern) {
					foundIssues.push({
						type: "placeholder",
						message: `Corrupted placeholder: ${corruptedPattern} → ${sourcePlaceholder}`,
					});

					// Replace the corrupted version with the correct one
					fixedText = fixedText.replace(corruptedPattern, sourcePlaceholder);
					appliedFixes.push({
						type: "placeholder",
						message: `Fixed corrupted placeholder: ${corruptedPattern} → ${sourcePlaceholder}`,
					});
				} else {
					// Placeholder is completely missing, try to add it
					foundIssues.push({
						type: "placeholder",
						message: `Missing placeholder: ${sourcePlaceholder}`,
					});

					const possiblePosition = this.findBestPlaceholderPosition(
						fixedText,
						source,
						sourcePlaceholder
					);

					if (possiblePosition !== -1) {
						fixedText = this.insertPlaceholder(
							fixedText,
							sourcePlaceholder,
							possiblePosition
						);
						appliedFixes.push({
							type: "placeholder",
							message: `Added missing placeholder: ${sourcePlaceholder}`,
						});
					}
				}
			}
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Find a corrupted version of a placeholder in translated text.
	 * @param {string} translated - Translated text.
	 * @param {string} sourcePlaceholder - Original placeholder.
	 * @returns {string|null} - Corrupted placeholder or null.
	 */
	findCorruptedPlaceholder(translated, sourcePlaceholder) {
		// Extract the placeholder name (e.g., "message" from "{message}")
		const placeholderName = sourcePlaceholder.slice(1, -1); // Remove { and }

		// Look for common corruption patterns
		const corruptionPatterns = [
			// Pattern: {mesaj}{message} or {mensaje}{message} (translated + original)
			new RegExp(`\\{[^}]*\\}\\{${placeholderName}\\}`, "g"),
			// Pattern: {mesaj} or {mensaje} (just translated)
			new RegExp(`\\{[^}]*${placeholderName.slice(0, -2)}[^}]*\\}`, "g"),
			// Pattern: Bạn{message} or text{message} (text prefixed to placeholder)
			new RegExp(`[^\\s]{2,}\\{${placeholderName}\\}`, "g"),
			// Pattern: {message}được or {message}text (text suffixed to placeholder)
			new RegExp(`\\{${placeholderName}\\}[^\\s]{2,}`, "g"),
			// Pattern: Any placeholder with similar length but different content
			new RegExp(
				`\\{[^}]{${Math.max(1, placeholderName.length - 2)},${placeholderName.length + 3}}\\}`,
				"g"
			),
		];

		for (const pattern of corruptionPatterns) {
			const matches = translated.match(pattern);
			if (matches && matches.length > 0) {
				// Return the first match that's not the original placeholder
				for (const match of matches) {
					if (match !== sourcePlaceholder) {
						return match;
					}
				}
			}
		}

		return null;
	}

	/**
	 * Find best position to insert a missing placeholder.
	 * @param {string} translated - Translated text.
	 * @param {string} source - Source text.
	 * @param {string} placeholder - Placeholder to insert.
	 * @returns {number} - Insertion index or -1.
	 */
	findBestPlaceholderPosition(translated, source, placeholder) {
		const sourcePosition = source.indexOf(placeholder);
		const sourceWords = source.slice(0, sourcePosition).split(" ").length;
		const translatedWords = translated.split(" ");

		return sourceWords >= translatedWords.length
			? translated.length
			: translatedWords.slice(0, sourceWords).join(" ").length;
	}

	/**
	 * Insert placeholder into text at specified position.
	 * @param {string} text - Text to modify.
	 * @param {string} placeholder - Placeholder to insert.
	 * @param {number} position - Insertion index.
	 * @returns {string} - Modified text.
	 */
	insertPlaceholder(text, placeholder, position) {
		return text.slice(0, position) + placeholder + text.slice(position);
	}
}

export default PlaceholderChecker;
