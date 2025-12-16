import { FileFormatAdapter } from "./base-adapter.js";
import gettextParser from "gettext-parser";

/**
 * Adapter for Gettext PO files
 */
export class PoAdapter implements FileFormatAdapter {
	extensions = [".po", ".pot"];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async parse(content: string): Promise<Record<string, any>> {
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
		} catch (error: any) {
			throw new Error(`PO parse error: ${error.message}`);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async serialize(data: Record<string, any>, options: any = {}): Promise<string> {
		const translations: any = {
			"": {},
		};

		// Convert flat object back to PO structure
		for (const [key, value] of Object.entries(data)) {
			translations[""][key] = {
				msgid: key,
				msgstr: [value],
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
