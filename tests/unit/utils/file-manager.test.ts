import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { FileManager } from "../../../src/utils/file-manager.js";
import { promises as fs } from "fs";

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
			vi.mocked(fs.readFile).mockResolvedValue('{"key": "value"}');

			const result = await FileManager.readFile("test.json");
			expect(result).toEqual({ key: "value" });
			expect(fs.readFile).toHaveBeenCalledWith("test.json", "utf8");
		});

		it("should throw error on file read failure", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Read failed"));

			await expect(FileManager.readFile("test.json")).rejects.toThrow("File read error");
		});
	});

	describe("writeFile", () => {
		it("should serialize and write JSON file", async () => {
			const data = { key: "value" };
			vi.mocked(fs.access).mockResolvedValue(undefined); // File exists for backup check

			await FileManager.writeFile("test.json", data, { atomic: false, backupFiles: false });

			expect(fs.writeFile).toHaveBeenCalledWith(
				"test.json",
				expect.stringContaining('"key": "value"'),
				"utf8"
			);
		});
	});

	describe("findLocaleFiles", () => {
		// FileManager.exists() is backed by fs.access, so the mocked filesystem must
		// reject access for paths that are not present.
		const mockExistingPaths = (paths: string[]) => {
			vi.mocked(fs.access).mockImplementation(async (p) => {
				if (!paths.includes(String(p))) {
					throw Object.assign(new Error(`ENOENT: ${String(p)}`), { code: "ENOENT" });
				}
			});
		};

		it("should prefer the nested <lang>/translation.json structure", async () => {
			mockExistingPaths(["/locales/en/translation.json", "/locales/en.json"]);

			const result = await FileManager.findLocaleFiles("/locales", "en");
			expect(result).toEqual(["/locales/en/translation.json"]);
		});

		it("should find the flat <lang>.json structure", async () => {
			mockExistingPaths(["/locales/en.json", "/locales/tr.json"]);

			const result = await FileManager.findLocaleFiles("/locales", "en");
			expect(result).toEqual(["/locales/en.json"]);
			expect(fs.readdir).not.toHaveBeenCalled();
		});

		it("should fall back to scanning the directory for other extensions", async () => {
			mockExistingPaths([]);
			(fs.readdir as unknown as Mock).mockResolvedValue(["en.yaml", "tr.yaml", "notes.txt"]);
			(fs.stat as unknown as Mock).mockResolvedValue({ isDirectory: () => false });

			const result = await FileManager.findLocaleFiles("/locales", "en");
			expect(result).toEqual(["/locales/en.yaml"]);
		});

		it("should throw if source language not found", async () => {
			mockExistingPaths([]);
			(fs.readdir as unknown as Mock).mockResolvedValue(["tr.json"]);

			await expect(FileManager.findLocaleFiles("/locales", "en")).rejects.toThrow(
				"Source language file not found"
			);
		});
	});
});
