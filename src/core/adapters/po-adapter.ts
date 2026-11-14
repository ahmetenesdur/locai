import type { TranslationObject } from "../../utils/object-transformer.js";
import { FileFormatAdapter } from "./base-adapter.js";
import gettextParser, { PoTranslation } from "gettext-parser";

/**
 * Adapter for Gettext PO files
 */
export class PoAdapter implements FileFormatAdapter {
	extensions = [".po", ".pot"];

	async parse(content: string): Promise<TranslationObject> {
		try {
			const po = gettextParser.po.parse(content);
			const result: Record<string, string> = {};

			// Convert PO structure to flat key-value pair
			// msgid -> msgstr[0]
			for (const context in po.translations) {
				for (const msgid in po.translations[context]) {
					if (msgid === "") continue; // Skip header
					const entry = po.translations[context][msgid];
					result[msgid] = entry.msgstr[0];
				}
			}

			return result;
		} catch (error) {
			throw new Error(
				`PO parse error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async serialize(data: TranslationObject): Promise<string> {
		const translations: Record<string, Record<string, PoTranslation>> = {
			"": {},
		};

		// Convert flat object back to PO structure
		for (const [key, value] of Object.entries(data)) {
			translations[""][key] = {
				msgid: key,
				// gettext-parser writes falsy msgstr values as "" and stringifies the rest
				msgstr: [value ? String(value) : ""],
			};
		}

		return gettextParser.po
			.compile({
				charset: "utf-8",
				headers: {
					"content-type": "text/plain; charset=utf-8",
				},
				translations,
			})
			.toString();
	}
}
