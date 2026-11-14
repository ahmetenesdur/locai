import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	StructureDetector,
	LocaleStructure,
} from "../../../../src/core/detection/structure-detector.js";
import { promises as fs, type Dirent } from "fs";

vi.mock("fs", async () => {
	return {
		promises: {
			readdir: vi.fn(),
		},
	};
});

/** The `readdir(path, { withFileTypes: true })` overload StructureDetector calls */
type ReaddirWithFileTypes = (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;
const readdirMock = vi.mocked(fs.readdir as ReaddirWithFileTypes);

function dirent(name: string, kind: "file" | "dir"): Dirent {
	return {
		name,
		parentPath: "/mock/path",
		isFile: () => kind === "file",
		isDirectory: () => kind === "dir",
		isBlockDevice: () => false,
		isCharacterDevice: () => false,
		isSymbolicLink: () => false,
		isFIFO: () => false,
		isSocket: () => false,
	};
}

describe("StructureDetector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should detect flat structure", async () => {
		readdirMock.mockResolvedValue([dirent("en.json", "file"), dirent("tr.json", "file")]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.FLAT);
	});

	it("should detect nested structure", async () => {
		readdirMock.mockResolvedValue([dirent("en", "dir"), dirent("tr", "dir")]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.NESTED);
	});

	it("should return unknown for empty directory", async () => {
		readdirMock.mockResolvedValue([]);

		const result = await StructureDetector.detect("/mock/path");
		expect(result).toBe(LocaleStructure.UNKNOWN);
	});
});
