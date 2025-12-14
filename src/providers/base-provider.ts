/**
 * Base class for translation providers
 */
import ErrorHelper from "../utils/error-helper.js";
import ConfidenceScorer from "../utils/confidence-scorer.js";

export interface ProviderConfig {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	[key: string]: any;
}

export interface TranslateOptions {
	detectedContext?: {
		category?: string;
		[key: string]: any;
	};
	lengthControl?: {
		mode?: string;
		[key: string]: any;
	};
	apiConfig?: Record<string, any>;
	retryOptions?: {
		maxRetries?: number;
		initialDelay?: number;
		[key: string]: any;
	};
	[key: string]: any;
}

export interface ConfidenceResult {
	score: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	metrics?: any;
	[key: string]: any;
}

export interface TranslationResult {
	translation: string;
	confidence: ConfidenceResult;
	rawResponse: any;
}

class BaseProvider {
	name: string;
	config: ProviderConfig;
	defaultModel?: string;
	defaultTemperature: number;
	defaultMaxTokens: number;
	commonHeaders: Record<string, string>;

	constructor(name: string, config: ProviderConfig = {}) {
		this.name = name;
		this.config = config;
		this.defaultModel = config.model;
		this.defaultTemperature = config.temperature || 0.3;
		this.defaultMaxTokens = config.maxTokens || 2000;

		this.commonHeaders = {
			"Content-Type": "application/json",
			"User-Agent": "ai-localization-tool/1.0",
		};
	}

	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		_options: TranslateOptions = {}
	): Promise<string> {
		throw new Error(`translate method must be implemented by ${this.name} provider`);
	}

	async analyze(prompt: string, options: any = {}): Promise<string> {
		throw new Error(`analyze method must be implemented by ${this.name} provider if supported`);
	}

	async chat(messages: any[], options: any = {}): Promise<string> {
		throw new Error(`chat method must be implemented by ${this.name} provider if supported`);
	}

	getApiKey(): string | undefined {
		throw new Error(`getApiKey method must be implemented by ${this.name} provider`);
	}

	getEndpoint(): string {
		throw new Error(`getEndpoint method must be implemented by ${this.name} provider`);
	}

	validateRequest(text: string, sourceLang: string, targetLang: string): void {
		if (!text || typeof text !== "string") {
			throw new Error("Text must be a non-empty string");
		}

		if (!sourceLang || !targetLang) {
			throw new Error("Source and target languages are required");
		}

		if (text.length > 10000) {
			throw new Error("Text too long for translation (max 10000 characters)");
		}
	}

	validateResponse(response: any, providerName: string): boolean {
		if (!response) {
			throw new Error(`No response from ${providerName} API`);
		}

		if (!response.data) {
			throw new Error(`Invalid response format from ${providerName}`);
		}

		return true;
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	handleApiError(error: any, providerName: string): never {
		if (error.response) {
			const status = error.response.status;
			const apiMessage =
				error.response.data?.error?.message || error.response.data?.message || null;

			// Rate limit error
			if (status === 429) {
				const retryAfter = error.response.headers?.["retry-after"] || 60;
				const limit = error.response.headers?.["x-ratelimit-limit"];
				const remaining = error.response.headers?.["x-ratelimit-remaining"];

				throw ErrorHelper.rateLimitError(providerName, {
					limit,
					current: limit ? limit - remaining : null,
					retryAfter,
					statusCode: status,
				});
			}

			// Server error (5xx)
			if (status >= 500) {
				throw ErrorHelper.serverError(providerName, status, apiMessage);
			}

			// Authentication error (401, 403)
			if (status === 401 || status === 403) {
				throw ErrorHelper.authError(providerName, status, apiMessage);
			}

			// Other API errors
			const apiError = ErrorHelper.createError("API_RESPONSE_ERROR", {
				provider: providerName,
				statusCode: status,
				apiMessage,
			});
			apiError.message = `${providerName} API error (${status})${apiMessage ? `: ${apiMessage}` : ""}`;
			throw apiError;
		}

		// Network errors
		if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
			throw ErrorHelper.networkError(providerName);
		}

		// Timeout errors
		if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
			throw ErrorHelper.timeoutError(providerName, error.config?.timeout);
		}

		// Unknown errors - preserve original for debugging
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const unknownError: any = new Error(`${providerName}: ${error.message}`);
		unknownError.code = "ERR_UNKNOWN";
		unknownError.originalError = error;
		throw unknownError;
	}

	generatePrompt(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): string {
		const context = options.detectedContext;
		let prompt = `Translate the following text from ${sourceLang} to ${targetLang}`;

		if (context?.category && context.category !== "general") {
			const categoryPrompts: Record<string, string> = {
				technical: ". Preserve technical terms and variable names exactly as they appear.",
				defi: ". Keep DeFi and cryptocurrency terms in English.",
				marketing: ". Use persuasive and engaging language appropriate for marketing.",
				legal: ". Maintain formal tone and precise legal terminology.",
				ui: ". Keep UI terms consistent and clear for user interface elements.",
			};

			prompt += categoryPrompts[context.category] || "";
		}

		if (options.lengthControl?.mode === "strict") {
			prompt += " Keep the translation length similar to the original.";
		}

		const placeholderRegex = /\{[^}]+\}/g;
		const hasPlaceholders = placeholderRegex.test(text);

		if (hasPlaceholders) {
			prompt +=
				"\n\nCRITICAL: This text contains placeholders like {variable}. You MUST preserve them EXACTLY as they appear. Do NOT translate the placeholder names, do NOT modify the curly braces, and do NOT add any text around them.";
		}

		prompt += `\n\nText to translate: "${text}"`;
		prompt += "\n\nProvide only the translation without explanations or quotes.";

		return prompt;
	}

	getConfig(options: ProviderConfig = {}): {
		model: string | undefined;
		temperature: number;
		maxTokens: number;
		max_tokens: number;
		apiKey: string;
		endpoint: string;
	} {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new Error(`API key not configured for ${this.name} provider`);
		}

		return {
			model: options.model || this.defaultModel,
			temperature: options.temperature ?? this.defaultTemperature,
			maxTokens: options.maxTokens || this.defaultMaxTokens,
			max_tokens: options.maxTokens || this.defaultMaxTokens, // Backward compatibility
			apiKey: apiKey,
			endpoint: this.getEndpoint(),
		};
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	extractTranslation(response: any, providerName: string): string {
		// Check for error response first
		if (response.error) {
			const errorMsg =
				response.error.message || response.error.error || JSON.stringify(response.error);
			throw new Error(`api: ${providerName} - ${errorMsg}`);
		}

		let translation = null;

		if (response.choices && response.choices[0]?.message?.content) {
			translation = response.choices[0].message.content.trim();
		} else if (response.choices && response.choices[0]?.text) {
			translation = response.choices[0].text.trim();
		} else if (response.choices && response.choices[0]?.delta?.content) {
			translation = response.choices[0].delta.content.trim();
		} else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
			translation = response.candidates[0].content.parts[0].text.trim();
		} else if (response.output && response.output.text) {
			translation = response.output.text.trim();
		} else if (response.text) {
			translation = response.text.trim();
		} else if (response.content) {
			translation = response.content.trim();
		} else if (
			response.data &&
			response.data.choices &&
			response.data.choices[0]?.message?.content
		) {
			translation = response.data.choices[0].message.content.trim();
		}

		if (!translation) {
			console.error(
				`Unable to extract translation from ${providerName} response. Response structure:`,
				{
					keys: Object.keys(response),
					choices: response.choices ? `Array(${response.choices.length})` : "undefined",
					choicesStructure:
						response.choices && response.choices[0]
							? Object.keys(response.choices[0])
							: "undefined",
				}
			);

			throw new Error(`Unable to extract translation from ${providerName} response`);
		}

		return translation;
	}

	/**
	 * Extract translation with confidence score
	 */
	extractTranslationWithConfidence(
		// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
		response: any,
		providerName: string,
		sourceText: string,
		sourceLang: string,
		targetLang: string,
		category: string = "general"
	): TranslationResult {
		const translation = this.extractTranslation(response, providerName);

		// Extract AI confidence from response
		const aiConfidence = ConfidenceScorer.extractAIConfidence(response, providerName);

		// Calculate comprehensive confidence score
		const confidenceResult = ConfidenceScorer.calculateConfidence({
			aiConfidence,
			sourceText,
			translation,
			sourceLang,
			targetLang,
			provider: providerName,
			category,
		});

		return {
			translation,
			confidence: confidenceResult as ConfidenceResult,
			rawResponse: response,
		};
	}

	sanitizeTranslation(translation: string): string {
		if (!translation || typeof translation !== "string") {
			throw new Error("Invalid translation format");
		}

		return translation
			.replace(/^["']|["']$/g, "")
			.replace(/^\s*Translation:\s*/i, "")
			.replace(/^\s*Result:\s*/i, "")
			.trim();
	}
}

export default BaseProvider;
