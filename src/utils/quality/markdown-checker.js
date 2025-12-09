/**
 * Markdown Preservation Checker
 * Ensures markdown formatting is preserved during translation
 */

class MarkdownChecker {
	constructor() {
		this.markdownPatterns = {
			// Headers
			headers: /^#{1,6}\s+/gm,
			// Bold
			bold: /\*\*(.+?)\*\*/g,
			// Italic
			italic: /\*(.+?)\*|_(.+?)_/g,
			// Links
			links: /\[([^\]]+)\]\(([^)]+)\)/g,
			// Images
			images: /!\[([^\]]*)\]\(([^)]+)\)/g,
			// Code inline
			inlineCode: /`([^`]+)`/g,
			// Lists
			unorderedLists: /^[\*\-\+]\s+/gm,
			orderedLists: /^\d+\.\s+/gm,
			// Blockquotes
			blockquotes: /^>\s+/gm,
			// Horizontal rules
			horizontalRules: /^(---|\*\*\*|___)$/gm,
		};
	}

	/**
	 * Check if markdown is preserved between source and translation
	 */
	checkMarkdownPreservation(sourceText, translatedText) {
		const issues = [];

		// Check each markdown pattern
		for (const [patternName, pattern] of Object.entries(this.markdownPatterns)) {
			const sourceMatches = (sourceText.match(pattern) || []).length;
			const translatedMatches = (translatedText.match(pattern) || []).length;

			if (sourceMatches !== translatedMatches) {
				issues.push({
					type: "markdown-preservation",
					severity: "error",
					pattern: patternName,
					message: `Markdown ${patternName} count mismatch: source has ${sourceMatches}, translation has ${translatedMatches}`,
					details: {
						sourceCount: sourceMatches,
						translatedCount: translatedMatches,
					},
				});
			}
		}

		// Check for broken markdown links
		const brokenLinks = this.checkBrokenMarkdownLinks(translatedText);
		issues.push(...brokenLinks);

		return issues;
	}

	/**
	 * Check for broken markdown links
	 */
	checkBrokenMarkdownLinks(text) {
		const issues = [];
		const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
		const matches = text.matchAll(linkPattern);

		for (const match of matches) {
			const [fullMatch, linkText, url] = match;

			// Check for common issues
			if (!linkText.trim()) {
				issues.push({
					type: "markdown-link",
					severity: "warning",
					message: `Empty link text in: "${fullMatch}"`,
				});
			}

			if (!url.trim()) {
				issues.push({
					type: "markdown-link",
					severity: "error",
					message: `Empty URL in: "${fullMatch}"`,
				});
			}

			// Check for spaces in URL (common translation error)
			if (url.includes(" ")) {
				issues.push({
					type: "markdown-link",
					severity: "warning",
					message: `URL contains spaces: "${url}"`,
				});
			}
		}

		return issues;
	}

	/**
	 * Fix markdown preservation issues
	 */
	fixMarkdownPreservation(sourceText, translatedText) {
		let fixedText = translatedText;
		const foundIssues = [];
		const appliedFixes = [];

		// Extract markdown elements from source
		const sourceMarkdown = this.extractMarkdownElements(sourceText);

		// Try to restore missing markdown
		for (const [type, elements] of Object.entries(sourceMarkdown)) {
			if (elements.length > 0) {
				const result = this.restoreMarkdownElements(fixedText, elements, type);
				fixedText = result.text;
				foundIssues.push(...result.foundIssues);
				appliedFixes.push(...result.appliedFixes);
			}
		}

		// Fix broken links
		const linkResult = this.fixBrokenLinks(fixedText);
		fixedText = linkResult.text;
		foundIssues.push(...linkResult.foundIssues);
		appliedFixes.push(...linkResult.appliedFixes);

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Extract markdown elements from text
	 */
	extractMarkdownElements(text) {
		const elements = {
			headers: [],
			bold: [],
			italic: [],
			links: [],
			images: [],
			inlineCode: [],
			lists: [],
		};

		// Extract headers
		const headerMatches = text.matchAll(this.markdownPatterns.headers);
		for (const match of headerMatches) {
			elements.headers.push(match[0]);
		}

		// Extract bold text
		const boldMatches = text.matchAll(this.markdownPatterns.bold);
		for (const match of boldMatches) {
			elements.bold.push(match[0]);
		}

		// Extract links
		const linkMatches = text.matchAll(this.markdownPatterns.links);
		for (const match of linkMatches) {
			elements.links.push({
				full: match[0],
				text: match[1],
				url: match[2],
			});
		}

		// Extract inline code
		const codeMatches = text.matchAll(this.markdownPatterns.inlineCode);
		for (const match of codeMatches) {
			elements.inlineCode.push(match[0]);
		}

		return elements;
	}

	/**
	 * Restore markdown elements that were lost in translation
	 */
	restoreMarkdownElements(text, elements, type) {
		const foundIssues = [];
		const appliedFixes = [];
		let fixedText = text;

		// For now, we'll just report issues
		// Full restoration would require more context about where to place elements
		if (elements.length > 0) {
			const currentCount = (fixedText.match(this.markdownPatterns[type]) || []).length;

			if (currentCount < elements.length) {
				foundIssues.push({
					type: "markdown-missing",
					message: `Missing ${elements.length - currentCount} ${type} elements`,
				});

				// Note: Full restoration is complex and context-dependent
				// This would need AI assistance to properly restore
			}
		}

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Fix broken markdown links
	 */
	fixBrokenLinks(text) {
		const foundIssues = [];
		const appliedFixes = [];
		let fixedText = text;

		// Fix spaces in URLs
		const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

		fixedText = fixedText.replace(linkPattern, (match, linkText, url) => {
			let fixedUrl = url;
			let modified = false;

			// Remove spaces from URL
			if (url.includes(" ")) {
				fixedUrl = url.replace(/\s+/g, "-");
				modified = true;

				foundIssues.push({
					type: "markdown-link",
					message: `URL had spaces: "${url}"`,
				});

				appliedFixes.push({
					type: "markdown-link",
					message: `Fixed URL spaces: "${url}" → "${fixedUrl}"`,
				});
			}

			return modified ? `[${linkText}](${fixedUrl})` : match;
		});

		return { text: fixedText, foundIssues, appliedFixes };
	}

	/**
	 * Check if text contains markdown
	 */
	hasMarkdown(text) {
		for (const pattern of Object.values(this.markdownPatterns)) {
			if (pattern.test(text)) {
				return true;
			}
		}
		return false;
	}
}

export default MarkdownChecker;
