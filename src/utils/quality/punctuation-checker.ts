export interface PunctuationIssue {
	type: "punctuation";
	message: string;
}

export interface PunctuationFixResult {
	text: string;
	foundIssues: PunctuationIssue[];
	appliedFixes: { type: "punctuation"; message: string }[];
}

/**
 * Punctuation Consistency Checker.
 * Ensures end punctuation marks are preserved in translation.
 */
class PunctuationChecker {
	/**
	 * Check for punctuation mismatches.
	 */
	checkPunctuation(source: string, translated: string): PunctuationIssue[] {
		const issues: PunctuationIssue[] = [];
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
	 */
	fixPunctuation(source: string, translated: string): PunctuationFixResult {
		const endPunctuation = /[.!?]$/;
		let fixedText = translated;
		const foundIssues: PunctuationIssue[] = [];
		const appliedFixes: { type: "punctuation"; message: string }[] = [];

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
	 */
	addPunctuation(text: string, punctuation: string): string {
		return text.trim() + punctuation;
	}
}

export default PunctuationChecker;
