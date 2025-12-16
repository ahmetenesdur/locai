import { describe, it, expect, vi, beforeEach } from "vitest";
import { FrameworkDetector } from "../../../../src/core/detection/framework-detector";
import { promises as fs } from "fs";
import path from "path";

vi.mock("fs", async () => {
	return {
		promises: {
			readFile: vi.fn(),
			access: vi.fn(),
		},
	};
});

describe("FrameworkDetector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should detect Next.js project with next-intl", async () => {
		(fs.readFile as any).mockResolvedValue(
			JSON.stringify({
				dependencies: { next: "14.0.0", "next-intl": "3.0.0" },
			})
		);

		const result = await FrameworkDetector.detect("/mock/path");
		expect(result).toEqual({
			framework: "next",
			localesDir: "messages",
			fileFormat: "json",
		});
	});

	it("should detect Next.js project with next-i18next", async () => {
		(fs.readFile as any).mockResolvedValue(
			JSON.stringify({
				dependencies: { next: "14.0.0", "next-i18next": "13.0.0" },
			})
		);

		const result = await FrameworkDetector.detect("/mock/path");
		expect(result).toEqual({
			framework: "next",
			localesDir: "public/locales",
			fileFormat: "json",
		});
	});

	it("should detect Vue project", async () => {
		(fs.readFile as any).mockResolvedValue(
			JSON.stringify({
				dependencies: { vue: "3.0.0" },
			})
		);

		const result = await FrameworkDetector.detect("/mock/path");
		expect(result).toEqual({
			framework: "vue",
			localesDir: "src/locales",
			fileFormat: "json",
		});
	});

	it("should fallback to unknown if no relevant dependencies", async () => {
		(fs.readFile as any).mockResolvedValue(
			JSON.stringify({
				dependencies: { lodash: "1.0.0" },
			})
		);
		(fs.access as any).mockRejectedValue(new Error("No pubspec"));

		const result = await FrameworkDetector.detect("/mock/path");
		expect(result).toEqual({ framework: "unknown" });
	});
});
