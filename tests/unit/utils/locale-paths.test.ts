import { describe, it, expect } from "vitest";
import path from "node:path";
import { targetLocaleFile } from "../../../src/utils/locale-paths.js";

describe("targetLocaleFile", () => {
	const localesDir = path.join(path.sep, "project", "locales");

	it("should keep the nested layout of a <source>/translation.json source", () => {
		expect(targetLocaleFile(path.join(localesDir, "en", "translation.json"), "pt-BR")).toBe(
			path.join(localesDir, "pt-BR", "translation.json")
		);
	});

	it("should put <language>.json next to any other source file", () => {
		expect(targetLocaleFile(path.join(localesDir, "en.json"), "zh-Hant")).toBe(
			path.join(localesDir, "zh-Hant.json")
		);
	});

	it("should keep the file inside the locales directory whatever the language says", () => {
		for (const sourceFile of [
			path.join(localesDir, "en", "translation.json"),
			path.join(localesDir, "en.json"),
		]) {
			const file = targetLocaleFile(sourceFile, "../../etc/passwd");
			expect(file.startsWith(localesDir + path.sep)).toBe(true);
		}
	});
});
