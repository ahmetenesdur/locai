import path from "path";
import InputValidator from "./input-validator.js";

/**
 * The locale file the translations of `sourceFile` into `language` belong in, in the source's
 * layout: `<root>/<source>/translation.json` gives `<root>/<language>/translation.json`, any
 * other source file gives `<language>.json` next to it.
 * @throws {Error} If `language` would put the file outside the locales directory.
 */
export function targetLocaleFile(sourceFile: string, language: string): string {
	const sourceDir = path.dirname(sourceFile);

	if (path.basename(sourceFile) === "translation.json") {
		const languageDir = InputValidator.createSafeFilePath(path.dirname(sourceDir), language);
		return path.join(languageDir, "translation.json");
	}

	return InputValidator.createSafeFilePath(sourceDir, `${language}.json`);
}
