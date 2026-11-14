import type { TranslationObject } from "../../utils/object-transformer.js";
import { FileFormatAdapter, SerializeOptions } from "./base-adapter.js";

/**
 * Adapter for JSON files
 */
export class JsonAdapter implements FileFormatAdapter {
	extensions = [".json", ".arb"];

	async parse(content: string): Promise<TranslationObject> {
		try {
			return JSON.parse(content) as TranslationObject;
		} catch (error) {
			throw new Error(
				`JSON parse error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async serialize(data: TranslationObject, options: SerializeOptions = {}): Promise<string> {
		const indent = options.indent || 4;
		return JSON.stringify(data, null, indent);
	}
}
