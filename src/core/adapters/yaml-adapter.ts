import { FileFormatAdapter } from "./base-adapter.js";
import yaml from "js-yaml";

/**
 * Adapter for YAML files
 */
export class YamlAdapter implements FileFormatAdapter {
	extensions = [".yaml", ".yml"];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async parse(content: string): Promise<Record<string, any>> {
		try {
			return (yaml.load(content) as Record<string, any>) || {};
		} catch (error: any) {
			throw new Error(`YAML parse error: ${error.message}`);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async serialize(data: Record<string, any>, options: any = {}): Promise<string> {
		return yaml.dump(data, {
			indent: options.indent || 2,
			lineWidth: -1, // Disable line wrapping
			noRefs: true,
		});
	}
}
