import axios, { AxiosInstance } from "axios";
import BaseProvider, { ProviderConfig, TranslateOptions } from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for Google Gemini models.
 */
class GeminiProvider extends BaseProvider {
	private client: AxiosInstance;

	/**
	 * Create a new GeminiProvider instance.
	 * @param {ProviderConfig} config - Provider configuration.
	 */
	constructor(config: ProviderConfig = {}) {
		super("gemini", config);

		this.client = axios.create({
			baseURL: "https://generativelanguage.googleapis.com/v1beta",
			headers: {
				...this.commonHeaders,
			},
			timeout: 30000,
			maxRedirects: 0,
			validateStatus: (status) => status < 500,
		});
	}

	getApiKey(): string | undefined {
		return process.env.GEMINI_API_KEY;
	}

	getEndpoint(model?: string): string {
		return `/models/${model || "gemini-3-flash"}:generateContent`;
	}

	/**
	 * Translate text using Gemini.
	 */
	async translate(
		text: string,
		sourceLang: string,
		targetLang: string,
		options: TranslateOptions = {}
	): Promise<string> {
		this.validateRequest(text, sourceLang, targetLang);

		const config = this.getConfig(options.apiConfig?.gemini);
		const model = config.model || "gemini-3-flash";
		const apiKey = this.getApiKey();

		if (!apiKey) {
			throw new Error("GEMINI_API_KEY environment variable not found");
		}

		const promptData = getPrompt("gemini", sourceLang, targetLang, text, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(
						this.getEndpoint(model),
						{
							...promptData,
							generationConfig: {
								temperature: config.temperature || 0.3,
								maxOutputTokens: config.maxTokens || 2048,
							},
						},
						{
							params: { key: apiKey },
						}
					);

					if (!response.data?.candidates || response.data.candidates.length === 0) {
						throw new Error("Failed to get translation candidate from Gemini API");
					}

					if (!response.data.candidates[0]?.content?.parts?.[0]?.text) {
						throw new Error("Invalid response format from Gemini API");
					}

					const translation = response.data.candidates[0].content.parts[0].text.trim();
					return this.sanitizeTranslation(translation);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.retryOptions?.maxRetries || 2,
				initialDelay: options.retryOptions?.initialDelay || 1000,
				context: "Gemini Provider",
				logContext: {
					source: sourceLang,
					target: targetLang,
				},
			}
		);
	}

	async analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
		const config = this.getConfig({
			model: options.model || "gemini-3-flash",
			temperature: options.temperature || 0.2,
			maxTokens: options.maxTokens || 1000,
		});

		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new Error("GEMINI_API_KEY environment variable not found");
		}

		const promptData = getAnalysisPrompt("gemini", prompt, options);

		return RetryHelper.withRetry(
			async () => {
				try {
					const response = await this.client.post(
						this.getEndpoint(config.model),
						{
							...promptData,
							generationConfig: {
								temperature: config.temperature,
								maxOutputTokens: config.maxTokens,
							},
						},
						{
							params: { key: apiKey },
						}
					);

					if (!response.data?.candidates || response.data.candidates.length === 0) {
						throw new Error("Failed to get analysis result from Gemini API");
					}

					if (!response.data.candidates[0]?.content?.parts?.[0]?.text) {
						throw new Error("Invalid response format from Gemini API");
					}

					const result = response.data.candidates[0].content.parts[0].text.trim();
					return this.sanitizeTranslation(result);
				} catch (error: any) {
					this.handleApiError(error, this.name);
					throw error;
				}
			},
			{
				maxRetries: options.maxRetries || 2,
				initialDelay: options.initialDelay || 1000,
				context: "Gemini Provider Analysis",
			}
		);
	}
}

// Lazy singleton - created on first use
let geminiProvider: GeminiProvider | null = null;

function getProvider(): GeminiProvider {
	if (!geminiProvider) {
		geminiProvider = new GeminiProvider();
	}
	return geminiProvider;
}

// Export both class and legacy functions
async function translate(
	text: string,
	sourceLang: string,
	targetLang: string,
	options: TranslateOptions = {}
): Promise<string> {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt: string, options: ProviderConfig = {}): Promise<string> {
	return getProvider().analyze(prompt, options);
}

export { translate, analyze, GeminiProvider };
