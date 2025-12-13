export interface StyleGuideConfig {
	formality?: string;
	toneOfVoice?: string;
	conventions?: {
		useOxfordComma?: boolean;
		useSentenceCase?: boolean;
		[key: string]: any;
	};
}

export interface StyleIssue {
	type: "oxford-comma" | "sentence-case";
	severity: "warning" | "info";
	message: string;
	suggestion?: string;
}

export interface StyleFixResult {
	text: string;
	foundIssues: StyleIssue[];
	appliedFixes: { type: "oxford-comma" | "sentence-case"; message: string }[];
}

/**
 * Style Guide Checker.
 * Enforces style guide conventions like Oxford comma and sentence case.
 */
class StyleGuideChecker {
	private styleGuide: Required<StyleGuideConfig> & {
		conventions: { useOxfordComma: boolean; useSentenceCase: boolean };
	};

	constructor(styleGuide: StyleGuideConfig = {}) {
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
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	checkStyleGuide(_sourceText: string, translatedText: string): StyleIssue[] {
		const issues: StyleIssue[] = [];

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
	 */
	checkOxfordComma(text: string): StyleIssue[] {
		const issues: StyleIssue[] = [];

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
	 */
	checkSentenceCase(text: string): StyleIssue[] {
		const issues: StyleIssue[] = [];

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
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	fixStyleGuide(sourceText: string, translatedText: string): StyleFixResult {
		let fixedText = translatedText;
		const foundIssues: StyleIssue[] = [];
		const appliedFixes: { type: "oxford-comma" | "sentence-case"; message: string }[] = [];

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
	 */
	fixOxfordComma(text: string): StyleFixResult {
		const foundIssues: StyleIssue[] = [];
		const appliedFixes: { type: "oxford-comma"; message: string }[] = [];
		let fixedText = text;

		// Pattern: word, word and word -> word, word, and word
		const listPattern = /(\w+),\s+(\w+)\s+(and|or)\s+(\w+)/gi;

		fixedText = fixedText.replace(listPattern, (match, word1, word2, conjunction, word3) => {
			// Check if comma already exists before conjunction
			if (!match.includes(`, ${conjunction}`)) {
				foundIssues.push({
					type: "oxford-comma",
					severity: "warning", // Added severity
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
	 */
	fixSentenceCase(text: string): {
		text: string;
		foundIssues: StyleIssue[];
		appliedFixes: { type: "sentence-case"; message: string }[];
	} {
		const foundIssues: StyleIssue[] = [];
		const appliedFixes: { type: "sentence-case"; message: string }[] = [];
		const lines = text.split("\n");
		const fixedLines: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();

			// Check for all caps headings
			const allCapsPattern = /^[A-Z\s]+$/;
			if (allCapsPattern.test(trimmed) && trimmed.length > 5 && trimmed.length < 100) {
				foundIssues.push({
					type: "sentence-case",
					severity: "info", // Added severity
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
	 */
	convertToSentenceCase(text: string): string {
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
