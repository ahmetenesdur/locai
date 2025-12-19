import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnvironment } from "../../../src/config/index.js";

describe("validateEnvironment", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		// Clear API keys for testing
		delete process.env.OPENAI_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.GEMINI_API_KEY;
		delete process.env.DEEPSEEK_API_KEY;
		delete process.env.XAI_API_KEY;
		delete process.env.DASHSCOPE_API_KEY;

		// Mock console.warn to verify output
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it("should pass if configured provider key exists", () => {
		process.env.OPENAI_API_KEY = "sk-test";
		validateEnvironment({ apiProvider: "openai" });
		expect(console.warn).not.toHaveBeenCalled();
	});

	it("should warn if configured provider key is missing", () => {
		validateEnvironment({ apiProvider: "openai" });
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("OPENAI_API_KEY is missing")
		);
	});

	it("should pass if auto mode and one key exists", () => {
		process.env.ANTHROPIC_API_KEY = "sk-ant-test";
		validateEnvironment({ apiProvider: "auto" });
		expect(console.warn).not.toHaveBeenCalled();
	});

	it("should warn if auto mode and no keys exist", () => {
		validateEnvironment({ apiProvider: "auto" });
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("No supported API keys found")
		);
	});
});
