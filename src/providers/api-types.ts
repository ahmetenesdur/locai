/**
 * Response bodies of the provider HTTP APIs, limited to the fields LocAI reads.
 * Every field is optional: bodies come from the network and are checked before use.
 */

/** Error object some APIs return in a 2xx/4xx body instead of a result. */
export interface ApiErrorBody {
	message?: string;
	error?: string;
}

interface ApiErrorEnvelope {
	error?: ApiErrorBody;
}

/** One choice of an OpenAI-compatible chat completion (OpenAI, DeepSeek, xAI, DashScope compatible mode). */
export interface ChatCompletionChoice {
	message?: { content?: string | null };
	/** Legacy completions API. */
	text?: string;
	/** Streaming chunk. */
	delta?: { content?: string };
	finish_reason?: string;
}

export interface ChatCompletionResponse extends ApiErrorEnvelope {
	choices?: ChatCompletionChoice[];
}

/** Google Gemini `models/{model}:generateContent`. */
export interface GeminiGenerateContentResponse extends ApiErrorEnvelope {
	candidates?: Array<{
		content?: { parts?: Array<{ text?: string }> };
		finishReason?: string;
	}>;
}

/** Alibaba DashScope native `text-generation/generation`. */
export interface DashScopeGenerationResponse extends ApiErrorEnvelope {
	output?: { text?: string };
}

/** Anthropic `/v1/messages`. */
export interface AnthropicMessagesResponse extends ApiErrorEnvelope {
	content?: Array<{ type: string; text?: string }>;
}

/** OpenAI `/v1/embeddings`. */
export interface EmbeddingResponse {
	data?: Array<{ index: number; embedding: number[] }>;
}

/**
 * Every body shape the generic `BaseProvider.extractTranslation` understands:
 * the OpenAI-compatible, Gemini and DashScope responses, plain `text` / `content`
 * strings, and an un-unwrapped Axios response whose `data` is a chat completion.
 */
export interface ProviderResponseBody
	extends ChatCompletionResponse, GeminiGenerateContentResponse, DashScopeGenerationResponse {
	text?: string;
	content?: string;
	data?: ChatCompletionResponse;
}
