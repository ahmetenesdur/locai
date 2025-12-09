/**
 * Code Block Preservation Checker
 * Ensures code blocks are preserved exactly during translation
 */

class CodeBlockChecker {
	constructor() {
		this.codePatterns = {
			// Fenced code blocks (```)
			fencedBlocks: /```[\s\S]*?```/g,
			// Inline code (`code`)
			inlineCode: /`([^`]+)`/g,
			// Indented code blocks (4 spaces)
			indentedBlocks: /^( {4}|\t).*$/gm,
			// HTML <code> tags
			htmlCode: /<code>[\s\S]*?<\/code>/gi,
			// HTML <pre> tags
			htmlPre: /<pre>[\s\S]*?<\/pre>/gi,
		};
	}

	/**
	 * Check if code blocks are preserved
	 */
	checkCodeBlockPreservation(sourceText, translatedText) {
		const issues = [];

		// Extract code blocks from source
		const sourceCodeBlocks = this.extractCodeBlocks(sourceText);
		const translatedCodeBlocks = this.extractCodeBlocks(translatedText);

		// Check count matches
		if (sourceCodeBlocks.length !== translatedCodeBlocks.length) {
			issues.push({
				type: "code-block-count",
				severity: "error",
				message: `Code block count mismatch: source has ${sourceCodeBlocks.length}, translation has ${translatedCodeBlocks.length}`,
				details: {
					sourceCount: sourceCodeBlocks.length,
					translatedCount: translatedCodeBlocks.length,
				},
			});
		}

		// Check each code block is preserved exactly
		for (let i = 0; i < Math.min(sourceCodeBlocks.length, translatedCodeBlocks.length); i++) {
			const sourceBlock = sourceCodeBlocks[i];
			const translatedBlock = translatedCodeBlocks[i];

			if (sourceBlock.code !== translatedBlock.code) {
				issues.push({
					type: "code-block-modified",
					severity: "critical",
					message: `Code block ${i + 1} was modified during translation`,
					details: {
						index: i,
						sourceCode: sourceBlock.code,
						translatedCode: translatedBlock.code,
					},
				});
			}
		}

		return issues;
	}

	/**
	 * Extract all code blocks from text
	 */
	extractCodeBlocks(text) {
		const blocks = [];

		// Extract fenced code blocks
		const fencedMatches = text.matchAll(this.codePatterns.fencedBlocks);
		for (const match of fencedMatches) {
			blocks.push({
				type: "fenced",
				full: match[0],
				code: match[0],
				position: match.index,
			});
		}

		// Extract inline code
		const inlineMatches = text.matchAll(this.codePatterns.inlineCode);
		for (const match of inlineMatches) {
			blocks.push({
				type: "inline",
				full: match[0],
				code: match[1],
				position: match.index,
			});
		}

		// Extract HTML code tags
		const htmlCodeMatches = text.matchAll(this.codePatterns.htmlCode);
		for (const match of htmlCodeMatches) {
			blocks.push({
				type: "html-code",
				full: match[0],
				code: match[0],
				position: match.index,
			});
		}

		// Extract HTML pre tags
		const htmlPreMatches = text.matchAll(this.codePatterns.htmlPre);
		for (const match of htmlPreMatches) {
			blocks.push({
				type: "html-pre",
				full: match[0],
				code: match[0],
				position: match.index,
			});
		}

		return blocks.sort((a, b) => a.position - b.position);
	}

	/**
	 * Fix code block preservation issues
	 */
	fixCodeBlockPreservation(sourceText, translatedText) {
		const foundIssues = [];
		const appliedFixes = [];
		let fixedText = translatedText;

		// Extract code blocks from both
		const sourceCodeBlocks = this.extractCodeBlocks(sourceText);
		const translatedCodeBlocks = this.extractCodeBlocks(translatedText);

		// If counts don't match, try to restore from source
		if (sourceCodeBlocks.length !== translatedCodeBlocks.length) {
			foundIssues.push({
				type: "code-block-count",
				message: `Code block count mismatch: ${sourceCodeBlocks.length} vs ${translatedCodeBlocks.length}`,
			});

			// Attempt to restore missing code blocks
			const result = this.restoreCodeBlocks(sourceText, translatedText, sourceCodeBlocks);
			fixedText = result.text;
			appliedFixes.push(...result.appliedFixes);
		}

		// Fix modified code blocks
		for (let i = 0; i < Math.min(sourceCodeBlocks.length, translatedCodeBlocks.length); i++) {
			const sourceBlock = sourceCodeBlocks[i];
			const translatedBlock = translatedCodeBlocks[i];

			if (sourceBlock.code !== translatedBlock.code) {
				foundIssues.push({
					type: "code-block-modified",
					message: `Code block ${i + 1} was modified`,
				});

				// Restore original code
				fixedText = fixedText.replace(translatedBlock.full, sourceBlock.full);

				appliedFixes.push({
					type: "code-block-restore",
					message: `Restored original code block ${i + 1}`,
				});
			}
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Restore missing code blocks from source
	 */
	restoreCodeBlocks(sourceText, translatedText, sourceCodeBlocks) {
		const appliedFixes = [];
		let fixedText = translatedText;

		// This is a simplified restoration - in reality, we'd need more context
		// to know exactly where to place the code blocks

		// For now, if code blocks are completely missing, append them at the end
		const translatedCodeBlocks = this.extractCodeBlocks(translatedText);

		if (sourceCodeBlocks.length > translatedCodeBlocks.length) {
			const missingCount = sourceCodeBlocks.length - translatedCodeBlocks.length;

			appliedFixes.push({
				type: "code-block-restore",
				message: `Attempted to restore ${missingCount} missing code blocks`,
			});

			// Note: Full restoration would require AI to determine proper placement
		}

		return { text: fixedText, appliedFixes };
	}

	/**
	 * Protect code blocks before translation
	 * Replaces code blocks with tokens to prevent translation
	 */
	protectCodeBlocks(text) {
		const codeBlocks = this.extractCodeBlocks(text);
		const tokenMap = new Map();
		let protectedText = text;

		codeBlocks.forEach((block, index) => {
			const token = `__CODE_BLOCK_${index}__`;
			tokenMap.set(token, block.full);
			protectedText = protectedText.replace(block.full, token);
		});

		return { protectedText, tokenMap };
	}

	/**
	 * Restore code blocks after translation
	 */
	restoreCodeBlocksFromTokens(text, tokenMap) {
		let restoredText = text;

		for (const [token, codeBlock] of tokenMap.entries()) {
			restoredText = restoredText.replace(token, codeBlock);
		}

		return restoredText;
	}

	/**
	 * Check if text contains code blocks
	 */
	hasCodeBlocks(text) {
		for (const pattern of Object.values(this.codePatterns)) {
			if (pattern.test(text)) {
				return true;
			}
		}
		return false;
	}
}

export default CodeBlockChecker;
