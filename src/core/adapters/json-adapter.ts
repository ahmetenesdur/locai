import { FileFormatAdapter } from "./base-adapter.js";

/**
 * Adapter for JSON files
 */
export class JsonAdapter implements FileFormatAdapter {
	extensions = [".json", ".arb"];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async parse(content: string): Promise<Record<string, any>> {
		try {
			return JSON.parse(content);
		} catch (error: any) {
			throw new Error(`JSON parse error: ${error.message}`);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async serialize(data: Record<string, any>, options: any = {}): Promise<string> {
		const indent = options.indent || 4;
		return JSON.stringify(data, null, indent);
	}
}
