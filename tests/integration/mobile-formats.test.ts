import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs/promises";
import { FileManager } from "../../src/utils/file-manager";

describe("Mobile Format Integration", () => {
	const tempDir = path.join(process.cwd(), "tests/temp/mobile");

	beforeEach(async () => {
		await fs.mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should correctly handle Android XML via FileManager", async () => {
		const filePath = path.join(tempDir, "strings.xml");
		const data = {
			app_name: "LocAI",
			"menu.settings": "Settings",
		};

		// Write using auto-detection
		await FileManager.writeFile(filePath, data);

		// Read back
		const readData = await FileManager.readFile(filePath);

		expect(readData).toEqual({
			app_name: "LocAI",
			"menu.settings": "Settings",
		});

		// Verify raw content contains XML tags
		const rawContent = await fs.readFile(filePath, "utf8");
		expect(rawContent).toContain("<resources>");
		expect(rawContent).toContain('<string name="app_name">LocAI</string>');
	});

	it("should correctly handle iOS Strings via FileManager", async () => {
		const filePath = path.join(tempDir, "Localizable.strings");
		const data = {
			welcome_msg: "Hello World",
			btn_ok: "OK",
		};

		// Write using auto-detection
		await FileManager.writeFile(filePath, data);

		// Read back
		const readData = await FileManager.readFile(filePath);

		expect(readData).toEqual(data);

		// Verify raw content strings format
		const rawContent = await fs.readFile(filePath, "utf8");
		expect(rawContent).toContain('"welcome_msg" = "Hello World";');
	});
});
