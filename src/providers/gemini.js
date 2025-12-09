import axios from "axios";
import BaseProvider from "./base-provider.js";
import { getPrompt, getAnalysisPrompt } from "../utils/prompt-templates.js";
import RetryHelper from "../utils/retry-helper.js";

/**
 * Provider implementation for Google Gemini models.
 */
class GeminiProvider extends BaseProvider {
	/**
	 * Create a new GeminiProvider instance.
	 * @param {Object} config - Provider configuration.
	 */
	constructor(config = {}) {
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

	getApiKey() {
		return process.env.GEMINI_API_KEY;
	}

	getEndpoint(model) {
		return `/models/${model}:generateContent`;
	}

	/**
	 * Translate text using Gemini.
	 * @param {string} text - Text to translate.
	 * @param {string} sourceLang - Source language code.
	 * @param {string} targetLang - Target language code.
	 * @param {Object} options - Translation options.
	 * @returns {Promise<string>} - Translated text.
	 */
	async translate(text, sourceLang, targetLang, options = {}) {
		this.validateRequest(text, sourceLang, targetLang);

		const config = this.getConfig(options.apiConfig?.gemini);
		const model = config.model || "gemini-2.0-flash-exp";
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
				} catch (error) {
					this.handleApiError(error, this.name);
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

	async analyze(prompt, options = {}) {
		const config = this.getConfig({
			model: options.model || "gemini-2.0-flash-exp",
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
				} catch (error) {
					this.handleApiError(error, this.name);
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
let geminiProvider = null;

function getProvider() {
	if (!geminiProvider) {
		geminiProvider = new GeminiProvider();
	}
	return geminiProvider;
}

// Export both class and legacy functions
async function translate(text, sourceLang, targetLang, options) {
	return getProvider().translate(text, sourceLang, targetLang, options);
}

async function analyze(prompt, options = {}) {
	return getProvider().analyze(prompt, options);
}

export { translate, analyze, GeminiProvider };
