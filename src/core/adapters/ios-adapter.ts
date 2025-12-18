import { FileFormatAdapter } from "./base-adapter.js";

/**
 * Adapter for iOS .strings files
 * Format: "KEY" = "VALUE";
 */
export class IosAdapter implements FileFormatAdapter {
	extensions = [".strings"];

	async parse(content: string): Promise<Record<string, any>> {
		const result: Record<string, any> = {};
		const lines = content.split(/\r?\n/);

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip comments and empty lines
			if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("//")) {
				continue;
			}

			// Parse "key" = "value";
			// Handle escaped quotes in value
			const match = trimmed.match(/^"(.+)"\s*=\s*"(.*)";$/);

			if (match) {
				const key = match[1];
				let value = match[2];

				// Unescape quotes and newlines if needed
				value = value.replace(/\\"/g, '"').replace(/\\n/g, "\n");

				result[key] = value;
			}
		}

		return result;
	}

	async serialize(data: Record<string, any>): Promise<string> {
		let output = "";

		// Sort keys for deterministic output
		const keys = Object.keys(data).sort();

		for (const key of keys) {
			let value = data[key];

			if (typeof value !== "string") {
				value = String(value);
			}

			// Escape quotes and newlines
			const safeKey = key; // Keys usually don't have quotes, but simplistic handling
			const safeValue = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");

			output += `"${safeKey}" = "${safeValue}";\n`;
		}

		return output;
	}
}
