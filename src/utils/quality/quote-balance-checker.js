class QuoteBalanceChecker {
	checkQuoteBalance(text) {
		const issues = [];

		// Check single quotes
		const singleQuotes = this._countQuotes(text, "'");
		if (singleQuotes.unbalanced) {
			issues.push({
				type: "unbalanced-quotes",
				severity: "error",
				message: `Unbalanced single quotes: ${singleQuotes.count} found`,
				char: "'",
			});
		}

		// Check double quotes
		const doubleQuotes = this._countQuotes(text, '"');
		if (doubleQuotes.unbalanced) {
			issues.push({
				type: "unbalanced-quotes",
				severity: "error",
				message: `Unbalanced double quotes: ${doubleQuotes.count} found`,
				char: '"',
			});
		}

		// Check guillemets (French quotes)
		const guillemetsOpen = (text.match(/«/g) || []).length;
		const guillemetsClose = (text.match(/»/g) || []).length;
		if (guillemetsOpen !== guillemetsClose) {
			issues.push({
				type: "unbalanced-quotes",
				severity: "error",
				message: `Unbalanced guillemets: ${guillemetsOpen} « vs ${guillemetsClose} »`,
				char: "«»",
			});
		}

		// Check German quotes
		const germanQuotesOpen = (text.match(/„/g) || []).length;
		const germanQuotesClose = (text.match(/"/g) || []).length;
		if (germanQuotesOpen !== germanQuotesClose) {
			issues.push({
				type: "unbalanced-quotes",
				severity: "warning",
				message: `Unbalanced German quotes: ${germanQuotesOpen} „ vs ${germanQuotesClose} "`,
				char: '„"', // Escaped quote
			});
		}

		return issues;
	}

	_countQuotes(text, quoteChar) {
		const count = (text.match(new RegExp(`\\${quoteChar}`, "g")) || []).length;
		return {
			count,
			unbalanced: count % 2 !== 0,
		};
	}

	fixQuoteBalance(text) {
		let fixedText = text;
		const foundIssues = [];
		const appliedFixes = [];

		// Fix single quotes
		const singleQuoteCheck = this._countQuotes(fixedText, "'");
		if (singleQuoteCheck.unbalanced) {
			foundIssues.push({
				type: "unbalanced-quotes",
				message: `Found ${singleQuoteCheck.count} single quotes (odd number)`,
			});

			// Try to fix by adding missing closing quote at the end
			if (fixedText.includes("'")) {
				fixedText = fixedText + "'";
				appliedFixes.push({
					type: "quote-balance",
					message: "Added missing closing single quote at the end",
				});
			}
		}

		// Fix double quotes
		const doubleQuoteCheck = this._countQuotes(fixedText, '"');
		if (doubleQuoteCheck.unbalanced) {
			foundIssues.push({
				type: "unbalanced-quotes",
				message: `Found ${doubleQuoteCheck.count} double quotes (odd number)`,
			});

			// Try to fix by adding missing closing quote at the end
			if (fixedText.includes('"')) {
				fixedText = fixedText + '"';
				appliedFixes.push({
					type: "quote-balance",
					message: "Added missing closing double quote at the end",
				});
			}
		}

		// Fix guillemets
		const guillemetsOpen = (fixedText.match(/«/g) || []).length;
		const guillemetsClose = (fixedText.match(/»/g) || []).length;
		if (guillemetsOpen > guillemetsClose) {
			fixedText = fixedText + "»";
			foundIssues.push({
				type: "unbalanced-quotes",
				message: "Found unbalanced guillemets",
			});
			appliedFixes.push({
				type: "quote-balance",
				message: "Added missing closing guillemet",
			});
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Validate that quotes in source and translation match in pattern
	 */
	validateQuoteConsistency(source, translated) {
		const issues = [];

		// Check if source has quotes but translation doesn't (or vice versa)
		const sourceHasSingleQuotes = source.includes("'");
		const translatedHasSingleQuotes = translated.includes("'");

		const sourceHasDoubleQuotes = source.includes('"');
		const translatedHasDoubleQuotes = translated.includes('"');

		// If source has quotes, translation should maintain similar quoting
		if (sourceHasSingleQuotes && !translatedHasSingleQuotes && !translatedHasDoubleQuotes) {
			issues.push({
				type: "quote-consistency",
				severity: "warning",
				message: "Source has quotes but translation doesn't",
			});
		}

		return issues;
	}
}

export default QuoteBalanceChecker;
