import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	StructureDetector,
	LocaleStructure,
} from "../../../../src/core/detection/structure-detector";
import { promises as fs } from "fs";

vi.mock("fs", async () => {
	return {
		promises: {
			readdir: vi.fn(),
		},
	};
});

describe("StructureDetector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should detect flat structure", async () => {
		(fs.readdir as any).mockResolvedValue([
			{ name: "en.json", isFile: () => true, isDirectory: () => false },
			{ name: "tr.json", isFile: () => true, isDirectory: () => false },
		]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.FLAT);
	});

	it("should detect nested structure", async () => {
		(fs.readdir as any).mockResolvedValue([
			{ name: "en", isFile: () => false, isDirectory: () => true },
			{ name: "tr", isFile: () => false, isDirectory: () => true },
		]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.NESTED);
	});

	it("should return unknown for empty directory", async () => {
		(fs.readdir as any).mockResolvedValue([]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.UNKNOWN);
	});
});
