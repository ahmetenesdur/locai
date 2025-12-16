import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileManager } from "../../../src/utils/file-manager";
import { promises as fs } from "fs";
import { JsonAdapter } from "../../../src/core/adapters/json-adapter";

// Mock fs
vi.mock("fs", async () => {
	return {
		promises: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			access: vi.fn(),
			readdir: vi.fn(),
			mkdir: vi.fn(),
			stat: vi.fn(),
			unlink: vi.fn(),
			rename: vi.fn(),
			copyFile: vi.fn(),
		},
	};
});

describe("FileManager", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset defaults
		FileManager.configure({});
	});

	describe("readFile", () => {
		it("should read and parse JSON file using JsonAdapter by default", async () => {
			(fs.readFile as any).mockResolvedValue('{"key": "value"}');

			const result = await FileManager.readFile("test.json");
			expect(result).toEqual({ key: "value" });
			expect(fs.readFile).toHaveBeenCalledWith("test.json", "utf8");
		});

		it("should throw error on file read failure", async () => {
			(fs.readFile as any).mockRejectedValue(new Error("Read failed"));

			await expect(FileManager.readFile("test.json")).rejects.toThrow("File read error");
		});
	});

	describe("writeFile", () => {
		it("should serialize and write JSON file", async () => {
			const data = { key: "value" };
			(fs.access as any).mockResolvedValue(undefined); // File exists for backup check

			await FileManager.writeFile("test.json", data, { atomic: false, backupFiles: false });

			expect(fs.writeFile).toHaveBeenCalledWith(
				"test.json",
				expect.stringContaining('"key": "value"'),
				"utf8"
			);
		});
	});

	describe("findLocaleFiles", () => {
		it("should find valid locale files", async () => {
			(fs.readdir as any).mockResolvedValue(["en.json", "tr.json", "rubbish.txt"]);

			const result = await FileManager.findLocaleFiles("/locales", "en");
			expect(result).toEqual(["/locales/en.json"]);
		});

		it("should throw if source language not found", async () => {
			(fs.readdir as any).mockResolvedValue(["tr.json"]);

			await expect(FileManager.findLocaleFiles("/locales", "en")).rejects.toThrow(
				"Source language file not found"
			);
		});
	});
});
