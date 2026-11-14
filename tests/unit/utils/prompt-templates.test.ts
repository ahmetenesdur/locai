import { describe, it, expect } from "vitest";
import {
	getPrompt,
	getAnalysisPrompt,
	type AnalysisPromptPayload,
} from "../../../src/utils/prompt-templates.js";
import type { CodeContext } from "../../../src/types/context.js";

/** OpenAI-style payloads carry their chat messages at the top level */
const messagesOf = (prompt: AnalysisPromptPayload) => {
	if (!("messages" in prompt)) {
		throw new Error("Expected a chat-style prompt payload");
	}
	return prompt.messages;
};

/** Every string in a prompt payload: all the text the model receives. */
const textOf = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(textOf).join("\n");
	if (value && typeof value === "object") return Object.values(value).map(textOf).join("\n");
	return "";
};

describe("Prompt Templates", () => {
	describe("getPrompt", () => {
		it("should return default openai template when provider is openai", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello");
			expect(prompt).toHaveProperty("messages");
			expect(messagesOf(prompt)).toHaveLength(2);
			expect(messagesOf(prompt)[1].content).toBe("Hello");
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
			const systemMessage = messagesOf(prompt)[0].content;
			expect(systemMessage).toContain("formal");
			expect(systemMessage).toContain("authoritative");
		});

		it("should include context instructions when provided", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello", {
				detectedContext: { category: "legal", confidence: 0.9, prompt: "Legal context" },
			});
			const systemMessage = messagesOf(prompt)[0].content;
			expect(systemMessage).toContain("Category: legal");
		});

		it("should generate length instructions based on strict mode", () => {
			const prompt = getPrompt("openai", "en", "es", "Hello", {
				mode: "strict",
				lengthControl: { rules: { strict: 1.0 } },
			});
			const systemMessage = messagesOf(prompt)[0].content;
			expect(systemMessage).toContain("CRITICAL: Translation must not exceed");
		});

		describe("source code context (deep context)", () => {
			const code: CodeContext = {
				filePath: "src/components/DeleteDialog.tsx",
				line: 12,
				component: "DeleteDialog",
				usageSnippet:
					'<Button variant="danger" onClick={onDelete}>{t("delete.confirm")}</Button>',
				comments: ["context: destructive action", "Confirmation dialog."],
				props: { variant: "danger", onClick: "{onDelete}" },
			};

			it.each(["openai", "anthropic", "gemini", "deepseek", "xai", "dashscope"])(
				"adds where the key is used to the %s prompt",
				(provider) => {
					const prompt = textOf(
						getPrompt(provider, "en", "tr", "Delete", { detectedContext: { code } })
					);

					expect(prompt).toContain("SOURCE CODE CONTEXT");
					expect(prompt).toContain("- File: src/components/DeleteDialog.tsx:12\n");
					expect(prompt).toContain("- Component: DeleteDialog\n");
					expect(prompt).toContain(
						'- Comments: "context: destructive action"; "Confirmation dialog."\n'
					);
					expect(prompt).toContain('- JSX props: variant="danger" onClick={onDelete}\n');
					expect(prompt).toContain(`- Code: ${code.usageSnippet}\n`);
				}
			);

			it("adds no section when the key was not found in the source code", () => {
				const prompt = textOf(
					getPrompt("openai", "en", "tr", "Delete", {
						detectedContext: { category: "ui" },
					})
				);

				expect(prompt).not.toContain("SOURCE CODE CONTEXT");
				expect(prompt).toContain(
					"Context Instructions: Provide a natural translation\n\nLENGTH CONTROL:"
				);
			});

			it("bounds the component, comments, props and code it sends", () => {
				const long = "x".repeat(1000);
				const props = Object.fromEntries(
					Array.from({ length: 20 }, (_, i) => [`prop${i}`, long])
				);
				const prompt = textOf(
					getPrompt("openai", "en", "tr", "Delete", {
						detectedContext: {
							code: {
								filePath: "src/Big.tsx",
								line: 1,
								component: long,
								usageSnippet: `${long}\n\n\t${long}`,
								comments: [`first\n   ${long}`, "second", "third", "fourth"],
								props,
							},
						},
					})
				);

				expect(prompt).toContain(`- Component: ${"x".repeat(100)}...\n`);
				expect(prompt).toContain(`"first ${"x".repeat(194)}..."; "second"; "third"\n`);
				expect(prompt).not.toContain("fourth");
				expect(prompt).toContain(`prop9="${"x".repeat(100)}..."\n`);
				expect(prompt).not.toContain("prop10=");
				expect(prompt).toContain(`- Code: ${"x".repeat(200)}...\n`);
			});
		});
	});

	describe("getAnalysisPrompt", () => {
		it("should return analysis prompt for openai", () => {
			const prompt = getAnalysisPrompt("openai", "Analyze me");
			expect(prompt).toHaveProperty("messages");
			expect(messagesOf(prompt)[1].content).toContain("Analyze me");
		});

		it("should handle custom categories", () => {
			const prompt = getAnalysisPrompt("openai", "Analyze me", {
				categories: { specific: "desc" },
			});
			expect(messagesOf(prompt)[1].content).toContain("specific");
		});
	});
});
