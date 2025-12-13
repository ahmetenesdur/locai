import { describe, it, expect } from "vitest";
import { getPrompt, getAnalysisPrompt } from "../../../src/utils/prompt-templates.js";

describe("Prompt Templates", () => {
	describe("getPrompt", () => {
		it("should return default openai template when provider is openai", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello");
			expect(prompt).toHaveProperty("messages");
			expect(prompt.messages).toHaveLength(2);
			expect(prompt.messages[1].content).toBe("Hello");
		});

		it("should handle missing options gracefully", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello");
			expect(prompt).toBeDefined();
		});

		it("should fallback to default if provider is unknown", () => {
			const prompt = getPrompt("unknown-provider", "en", "es", "Hello");
			expect(prompt).toHaveProperty("messages");
		});

		it("should include style guide instructions when provided", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello", {
				styleGuide: { formality: "formal", toneOfVoice: "authoritative" },
			});
			const systemMessage = prompt.messages[0].content;
			expect(systemMessage).toContain("formal");
			expect(systemMessage).toContain("authoritative");
		});

		it("should include context instructions when provided", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello", {
				detectedContext: { category: "legal", confidence: 0.9, prompt: "Legal context" },
			});
			const systemMessage = prompt.messages[0].content;
			expect(systemMessage).toContain("Category: legal");
		});

		it("should generate length instructions based on strict mode", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello", {
				mode: "strict",
				lengthControl: { rules: { strict: 1.0 } },
			});
			const systemMessage = prompt.messages[0].content;
			expect(systemMessage).toContain("CRITICAL: Translation must not exceed");
		});
	});

	describe("getAnalysisPrompt", () => {
		it("should return analysis prompt for openai", () => {
			const prompt = getAnalysisPrompt("openai", "Analyze me");
			expect(prompt).toHaveProperty("messages");
			expect(prompt.messages[1].content).toContain("Analyze me");
		});

		it("should handle custom categories", () => {
			const prompt = getAnalysisPrompt("openai", "Analyze me", {
				categories: { specific: "desc" },
			});
			expect(prompt.messages[1].content).toContain("specific");
		});
	});
});
