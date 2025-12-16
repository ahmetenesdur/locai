import { promises as fs } from "fs";
import path from "path";

export enum LocaleStructure {
	FLAT = "flat", // en.json, tr.json
	NESTED = "nested", // en/common.json, tr/common.json
	NAMESPACED = "namespaced", // common.en.json (less common)
	UNKNOWN = "unknown",
}

export class StructureDetector {
	static async detect(localesDir: string): Promise<LocaleStructure> {
		try {
			const entries = await fs.readdir(localesDir, { withFileTypes: true });

			// Check for files (Flat)
			const hasLocaleFiles = entries.some(
				(entry) =>
					entry.isFile() &&
					/^[a-z]{2}(-[A-Z]{2})?\.(json|yaml|yml|po|arb|properties)$/.test(entry.name)
			);

			if (hasLocaleFiles) {
				return LocaleStructure.FLAT;
			}

			// Check for directories (Nested)
			const hasLocaleDirs = entries.some(
				(entry) => entry.isDirectory() && /^[a-z]{2}(-[A-Z]{2})?$/.test(entry.name)
			);

			if (hasLocaleDirs) {
				return LocaleStructure.NESTED;
			}

			return LocaleStructure.UNKNOWN;
		} catch (error) {
			return LocaleStructure.UNKNOWN;
		}
	}
}
