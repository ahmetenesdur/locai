import type { TranslationObject } from "../../utils/object-transformer.js";
import { FileFormatAdapter } from "./base-adapter.js";
import dotProperties from "dot-properties";

/**
 * Adapter for Java .properties files
 */
export class PropertiesAdapter implements FileFormatAdapter {
	extensions = [".properties"];

	async parse(content: string): Promise<TranslationObject> {
		try {
			return dotProperties.parse(content);
		} catch (error) {
			throw new Error(
				`Properties parse error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async serialize(data: TranslationObject): Promise<string> {
		// dot-properties doesn't have a standardized stringify, simple implementation
		// or used a different library, but let's do a simple one for now or use the lib if it supports it.
		// Checking docs: dot-properties is mostly a parser. 'properties' npm package is better for writing but we installed dot-properties.
		// Let's implement a robust serializer manually as it's simple enough for standard usage.

		return Object.entries(data)
			.map(([key, value]) => {
				// Escape special characters
				const escapedKey = key.replace(/([=:])/g, "\\$1").replace(/ /g, "\\ ");
				const escapedValue = String(value).replace(/\n/g, "\\n");
				return `${escapedKey}=${escapedValue}`;
			})
			.join("\n");
	}
}
