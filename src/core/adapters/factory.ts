import path from "path";
import { FileFormatAdapter } from "./base-adapter.js";
import { JsonAdapter } from "./json-adapter.js";
import { YamlAdapter } from "./yaml-adapter.js";
import { PoAdapter } from "./po-adapter.js";
import { PropertiesAdapter } from "./properties-adapter.js";
import { AndroidAdapter } from "./android-adapter.js";
import { IosAdapter } from "./ios-adapter.js";

/**
 * Factory class to manage file format adapters
 */
export class FormatFactory {
	private static adapters: FileFormatAdapter[] = [
		new JsonAdapter(),
		new YamlAdapter(),
		new PoAdapter(),
		new PropertiesAdapter(),
		new AndroidAdapter(),
		new IosAdapter(),
	];

	/**
	 * Get adapter for a specific file path
	 * @param filePath - Path to file
	 */
	static getAdapter(filePath: string): FileFormatAdapter {
		const ext = path.extname(filePath).toLowerCase();
		const adapter = this.adapters.find((a) => a.extensions.includes(ext));

		if (!adapter) {
			// Default to JSON if unknown, or throw error?
			// For robustness, maybe throw or default to JSON but warn.
			// Let's default to JSON for .arb or weird unknown formats if they look like json,
			// but strict checking is establishing explicitly.
			// Fallback to JSON for now as it's the safest bet for web.
			return new JsonAdapter();
		}

		return adapter;
	}

	/**
	 * Get adapter by format name (json, yaml, etc.)
	 */
	static getAdapterByFormat(format: string): FileFormatAdapter {
		const formatted = format.startsWith(".") ? format : `.${format}`;
		const adapter = this.adapters.find((a) => a.extensions.includes(formatted));
		if (!adapter) {
			throw new Error(`Unsupported format: ${format}`);
		}
		return adapter;
	}
}
