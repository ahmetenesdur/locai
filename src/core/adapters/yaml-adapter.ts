import type { TranslationObject } from "../../utils/object-transformer.js";
import { FileFormatAdapter, SerializeOptions } from "./base-adapter.js";
import yaml from "js-yaml";

/**
 * Adapter for YAML files
 */
export class YamlAdapter implements FileFormatAdapter {
	extensions = [".yaml", ".yml"];

	async parse(content: string): Promise<TranslationObject> {
		try {
			return (yaml.load(content) as TranslationObject | undefined) || {};
		} catch (error) {
			throw new Error(
				`YAML parse error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async serialize(data: TranslationObject, options: SerializeOptions = {}): Promise<string> {
		return yaml.dump(data, {
			indent: options.indent || 2,
			lineWidth: -1, // Disable line wrapping
			noRefs: true,
		});
	}
}
