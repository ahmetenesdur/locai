import ProviderFactory from "../../core/provider-factory.js";
import { AIProvider } from "../../core/provider-factory.js";
import { ProviderConfig } from "../../providers/base-provider.js";

export interface ToneVerificationResult {
	passed: boolean;
	score: number;
	reasoning: string;
	suggestions?: string;
}

export class ToneVerifier {
	private provider!: AIProvider;
	private initialized: boolean = false;

	constructor() {
		// Provider will be initialized lazily to avoid startup overhead
		// or circular dependency issues if ProviderFactory needs full env loaded
	}

	private async initProvider(providerName: string) {
		if (this.initialized && this.provider) return;

		// We use a lighter model if available, or just the default configured provider.
		try {
			// Try to get a specific "judge" provider if configured, otherwise default
			this.provider = ProviderFactory.getProvider(providerName, true);
		} catch (error) {
			// If specific provider fails, might fall back to any available
			const available = ProviderFactory.getAvailableProviders();
			if (available.length > 0) {
				this.provider = ProviderFactory.getProvider(available[0], true);
			} else {
				throw new Error("No AI providers available for ToneVerifier");
			}
		}
		this.initialized = true;
	}

	async verify(
		sourceText: string,
		translatedText: string,
		sourceLang: string,
		targetLang: string,
		targetTone: string,
		providerName: string = "openai",
		options: ProviderConfig = {}
	): Promise<ToneVerificationResult> {
		if (!targetTone) {
			return { passed: true, score: 10, reasoning: "No target tone specified." };
		}

		await this.initProvider(providerName);

		const systemInstruction = `Role: You are a strict linguistic tone auditor.
Task: Analyze the tone of the provided translation against the Target Tone.

Instructions:
1. Analyze if the translation matches the Target Tone in the context of the Source text.
2. Ignore minor grammatical errors; focus on TONE and PERSONA (e.g., Formal, Casual, Authoritative, Friendly).
3. Rate the match on a scale of 0-10 (10 = Perfect match, 0 = Complete mismatch/Robot/Wrong tone).
4. If score is below 7, set passed to false.

Output JSON format ONLY:
{
  "passed": boolean,
  "score": number, // 0-10
  "reasoning": "brief explanation",
  "suggestions": "optional suggestion for improvement"
}`;

		const userMessage = `
Target Tone: "${targetTone}"
Source (${sourceLang}): "${sourceText}"
Translation (${targetLang}): "${translatedText}"
`;

		try {
			let response: string;

			if (this.provider.chat) {
				response = await this.provider.chat(
					[
						{ role: "system", content: systemInstruction },
						{ role: "user", content: userMessage },
					],
					options
				);
			} else if (this.provider.analyze) {
				// Fallback to analyze if chat not available (unlikely for OpenAI)
				response = await this.provider.analyze(
					systemInstruction + "\n" + userMessage,
					options
				);
			} else {
				// Fallback to using translate as a generic prompt runner
				response = await this.provider.translate(
					systemInstruction + "\n" + userMessage,
					"System",
					"JSON"
				);
			}

			// Clean up response if it contains markdown code blocks
			const cleanResponse = response.replace(/```json\n?|\n?```/g, "").trim();

			const result = JSON.parse(cleanResponse) as ToneVerificationResult;

			return {
				passed: result.passed,
				score: result.score,
				reasoning: result.reasoning || "No reasoning provided",
				suggestions: result.suggestions,
			};
		} catch (error) {
			console.warn("Tone verification failed:", error);
			// Fail open - if verification fails, we don't block the translation
			return {
				passed: true,
				score: 0,
				reasoning: `Verification failed: ${(error as Error).message}`,
			};
		}
	}
}
