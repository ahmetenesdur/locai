export interface HtmlTagIssue {
	type: "htmlTag";
	message: string;
	source?: string[];
	translated?: string[];
}

export interface HtmlTagFixResult {
	text: string;
	foundIssues: HtmlTagIssue[];
	appliedFixes: { type: "htmlTag"; message: string }[];
}

/**
 * HTML Tag Consistency Checker.
 * Ensures HTML tags are preserved and correctly nested in translations.
 */
class HtmlTagChecker {
	/**
	 * Check for HTML tag mismatches between source and translation.
	 */
	checkHtmlTags(source: string, translated: string): HtmlTagIssue[] {
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
	 */
	fixHtmlTags(source: string, translated: string): HtmlTagFixResult {
		const tagRegex = /<[^>]+>/g;
		const sourceTags = source.match(tagRegex) || [];
		let fixedText = translated;
		const foundIssues: HtmlTagIssue[] = [];
		const appliedFixes: { type: "htmlTag"; message: string }[] = [];

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
	 */
	insertHtmlTag(text: string, tag: string): string {
		const isClosingTag = tag.startsWith("</");
		if (isClosingTag) {
			const openingTag = tag.replace("/", "");
			const position = text.indexOf(openingTag) + openingTag.length;
			if (position >= openingTag.length) {
				return text.slice(0, position) + tag + text.slice(position);
			}
		}
		return tag + text;
	}
}

export default HtmlTagChecker;
