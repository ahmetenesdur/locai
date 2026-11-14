# AI Providers

Locai can use six AI providers. Set the API key of at least one of them; pick the main one with `apiProvider` (or `--provider`).

## Supported Providers

| Provider      | Default Model               | API key variable    | Default RPM | Default Concurrency |
| ------------- | --------------------------- | ------------------- | ----------- | ------------------- |
| **OpenAI**    | `gpt-4o`                    | `OPENAI_API_KEY`    | 300         | 5                   |
| **Dashscope** | `qwen-plus`                 | `DASHSCOPE_API_KEY` | 80          | 6                   |
| **DeepSeek**  | `deepseek-chat`             | `DEEPSEEK_API_KEY`  | 30          | 2                   |
| **Gemini**    | `gemini-3-flash`            | `GEMINI_API_KEY`    | 300         | 5                   |
| **Anthropic** | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` | 50          | 5                   |
| **XAI**       | `grok-4`                    | `XAI_API_KEY`       | 80          | 8                   |

> **Note:** The RPM and concurrency columns are the built-in rate limiter defaults. Override them with `rateLimiter.providerLimits`; the repository's [`localize.config.ts`](../localize.config.ts) uses higher example values (for example OpenAI 1000 RPM / 15). Change the model with `apiConfig.<provider>.model`.

## Setup Guides

### OpenAI

1. Get key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Add to `.env`: `OPENAI_API_KEY=sk-...`

### Gemini (Google)

1. Get key from [aistudio.google.com](https://aistudio.google.com/)
2. Add to `.env`: `GEMINI_API_KEY=AIza...`

### Anthropic (Claude)

1. Get key from [console.anthropic.com](https://console.anthropic.com/)
2. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

### DeepSeek

1. Get key from [platform.deepseek.com](https://platform.deepseek.com/)
2. Add to `.env`: `DEEPSEEK_API_KEY=sk-...`

### Dashscope (Alibaba)

1. Get key from [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/)
2. Add to `.env`: `DASHSCOPE_API_KEY=sk-...`

### XAI (Grok)

1. Get key from [x.ai](https://x.ai/)
2. Add to `.env`: `XAI_API_KEY=xai-...`

## Fallback

With `useFallback: true` (the default), Locai builds a chain from the providers whose API key is set:

1. `apiProvider` (or `--provider`) first, if its key is set.
2. Then the providers listed in `fallbackOrder`, then any other providers with a key. Without `fallbackOrder` the built-in order is Dashscope → XAI → OpenAI → Anthropic → DeepSeek → Gemini.

If a request fails, the next provider in the chain is tried, cycling through the chain up to three times. A provider that fails five times in a row is skipped for two minutes. During a run, Locai also re-orders the chain by each provider's success rate and response time.

With `useFallback: false`, only `apiProvider` is used, and its API key must be set.

**Example:**

```typescript
// localize.config.ts
export default {
	apiProvider: "openai",
	useFallback: true,
	fallbackOrder: ["openai", "anthropic", "dashscope", "deepseek", "gemini", "xai"],
};
```
