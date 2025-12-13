/**
 * Glossary Manager
 * Manages brand terminology and ensures consistent translations
 */

export interface GlossaryEntry {
	term: string;
	translation: string;
	caseSensitive?: boolean;
	languages?: string[];
}

export interface ProtectedTerm {
	original: string;
	translation: string;
	term: string;
}

export interface GlossaryConfig {
	glossary?: Record<string, string | Partial<GlossaryEntry> | Record<string, string>>;
	enabled?: boolean;
	caseSensitive?: boolean;
	preserveFormatting?: boolean;
}

class GlossaryManager {
	private glossary: Record<string, any>;
	public enabled: boolean;
	private caseSensitive: boolean;
	private preserveFormatting: boolean;

	constructor(config: GlossaryConfig = {}) {
		this.glossary = config.glossary || {};
		this.enabled = config.enabled !== false;
		this.caseSensitive = config.caseSensitive !== false;
		this.preserveFormatting = config.preserveFormatting !== false;
	}

	/**
	 * Apply glossary terms to source text before translation
	 * Replaces terms with protected tokens to preserve them
	 */
	protectTerms(
		text: string,
		sourceLang: string,
		targetLang: string
	): { protectedText: string; termMap: Map<string, ProtectedTerm> } {
		if (!this.enabled || !text || typeof text !== "string") {
			return { protectedText: text, termMap: new Map() };
		}

		const termMap = new Map<string, ProtectedTerm>();
		let protectedText = text;
		let tokenIndex = 0;

		// Get applicable glossary entries
		const entries = this.getApplicableEntries(sourceLang, targetLang);

		// Sort by length (longest first) to avoid partial matches
		const sortedEntries = entries.sort((a, b) => b.term.length - a.term.length);

		for (const entry of sortedEntries) {
			const { term, translation, caseSensitive } = entry;
			const isCaseSensitive = caseSensitive ?? this.caseSensitive;

			// Create regex for finding the term
			const flags = isCaseSensitive ? "g" : "gi";
			const escapedTerm = this.escapeRegex(term);
			const regex = new RegExp(`\\b${escapedTerm}\\b`, flags);

			// Find all matches
			const matches = protectedText.match(regex);
			if (matches) {
				matches.forEach((match) => {
					const token = `__GLOSSARY_TOKEN_${tokenIndex}__`;
					tokenIndex++;

					// Preserve original formatting if needed
					const preservedTranslation = this.preserveFormatting
						? this.matchFormatting(match, translation)
						: translation;

					termMap.set(token, {
						original: match,
						translation: preservedTranslation,
						term: term,
					});

					// Replace with token
					protectedText = protectedText.replace(match, token);
				});
			}
		}

		return { protectedText, termMap };
	}

	/**
	 * Restore protected terms in translated text
	 */
	restoreTerms(translatedText: string, termMap: Map<string, ProtectedTerm>): string {
		if (!this.enabled || !termMap || termMap.size === 0) {
			return translatedText;
		}

		let restoredText = translatedText;

		// Replace tokens with translations
		for (const [token, data] of termMap.entries()) {
			restoredText = restoredText.replace(new RegExp(token, "g"), data.translation);
		}

		return restoredText;
	}

	/**
	 * Get applicable glossary entries for language pair
	 */
	getApplicableEntries(sourceLang: string, targetLang: string): GlossaryEntry[] {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const entries: GlossaryEntry[] = [];

		for (const [term, config] of Object.entries(this.glossary)) {
			// Simple format: { "API": "API" }
			if (typeof config === "string") {
				entries.push({
					term,
					translation: config,
					caseSensitive: this.caseSensitive,
				});
			}
			// Advanced format: { "API": { translation: "API", caseSensitive: true } }
			else if (typeof config === "object" && config.translation) {
				entries.push({
					term,
					translation: config.translation,
					caseSensitive: config.caseSensitive ?? this.caseSensitive,
					languages: config.languages,
				});
			}
			// Language-specific format
			else if (typeof config === "object" && config[targetLang]) {
				entries.push({
					term,
					translation: config[targetLang],
					caseSensitive: this.caseSensitive,
				});
			}
		}

		return entries;
	}

	/**
	 * Match formatting (capitalization) from original to translation
	 */
	matchFormatting(original: string, translation: string): string {
		// All caps
		if (original === original.toUpperCase()) {
			return translation.toUpperCase();
		}

		// Title case (first letter uppercase)
		if (
			original[0] === original[0].toUpperCase() &&
			original.slice(1) === original.slice(1).toLowerCase()
		) {
			return translation.charAt(0).toUpperCase() + translation.slice(1).toLowerCase();
		}

		// First char uppercase
		if (original[0] === original[0].toUpperCase()) {
			return translation.charAt(0).toUpperCase() + translation.slice(1);
		}

		return translation;
	}

	/**
	 * Escape special regex characters
	 */
	escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Validate glossary configuration
	 */
	validate(): { valid: boolean; errors: string[]; warnings: string[] } {
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!this.glossary || typeof this.glossary !== "object") {
			errors.push("Glossary must be an object");
			return { valid: false, errors, warnings };
		}

		for (const [term, config] of Object.entries(this.glossary)) {
			if (!term || typeof term !== "string") {
				errors.push(`Invalid term: ${term}`);
				continue;
			}

			// Validate simple format
			if (typeof config === "string" && !config) {
				warnings.push(`Empty translation for term: ${term}`);
			}

			// Validate object format
			if (typeof config === "object") {
				if (!config.translation && !Object.keys(config).some((key) => key.length === 2)) {
					errors.push(`Invalid glossary entry for term: ${term}`);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Get statistics about glossary
	 */
	getStats(): any {
		const terms = Object.keys(this.glossary);
		return {
			totalTerms: terms.length,
			enabled: this.enabled,
			caseSensitive: this.caseSensitive,
			preserveFormatting: this.preserveFormatting,
			terms: terms,
		};
	}

	/**
	 * Load glossary from file
	 */
	static async loadFromFile(filePath: string): Promise<GlossaryManager> {
		try {
			const { readFile } = await import("fs/promises");
			const content = await readFile(filePath, "utf8");
			const glossary = JSON.parse(content);
			return new GlossaryManager({ glossary, enabled: true });
		} catch (error: any) {
			throw new Error(`Failed to load glossary from ${filePath}: ${error.message}`);
		}
	}
}

export default GlossaryManager;
