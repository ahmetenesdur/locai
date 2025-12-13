import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Logger from "../../../src/utils/logger.js";
import { promises as fs } from "fs";
import path from "path";

vi.mock("fs", () => ({
	promises: {
		mkdir: vi.fn(),
		stat: vi.fn(),
		appendFile: vi.fn(),
		rename: vi.fn(),
		readdir: vi.fn(),
		unlink: vi.fn(),
	},
}));

describe("Logger", () => {
	let logger: Logger;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		logger = new Logger({
			saveErrorLogs: true,
			logDirectory: "/test/logs",
			verbose: true,
		});

		// Mock stats to prevent errors
		(fs.stat as any).mockResolvedValue({
			size: 100,
			mtime: new Date(),
		});
		(fs.readdir as any).mockResolvedValue([]);
	});

	it("should initialize correctly", async () => {
		await logger.initialize();
		expect(fs.mkdir).toHaveBeenCalledWith("/test/logs", { recursive: true });
	});

	it("should write to file on error", async () => {
		await logger.error("test error", { detail: "info" });

		expect(fs.appendFile).toHaveBeenCalled();
		const callArgs = (fs.appendFile as any).mock.calls[0];
		expect(callArgs[0]).toContain("errors.log");
		expect(callArgs[1]).toContain("test error");
	});

	it("should rotate logs when size exceeded", async () => {
		// Force rotation condition
		(fs.stat as any).mockResolvedValue({
			size: 1024 * 1024 * 20, // 20MB, larger than default 10MB
			mtime: new Date(),
		});

		await logger.checkAndRotateLogs();
		expect(fs.rename).toHaveBeenCalled();
	});

	it("should clean up old logs", async () => {
		(fs.readdir as any).mockResolvedValue([
			"error.1.log",
			"error.2.log",
			"error.3.log",
			"error.4.log",
			"error.5.log",
			"error.6.log",
		]);

		// Mock cleanup call (usually called inside rotateLog)
		await logger.cleanupOldLogs("/test/logs", "error");

		// If maxFiles is 5 (default), it should delete 1 file (6 files total)
		expect(fs.unlink).toHaveBeenCalled();
	});
});
