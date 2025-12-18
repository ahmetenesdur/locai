# AI Providers

Locai supports multiple industry-leading AI providers, allowing you to balance cost, speed, and translation quality.

## Supported Models

| Provider      | Default Model               | RPM Limit | Concurrency | Context Limit |
| ------------- | --------------------------- | --------- | ----------- | ------------- |
| **OpenAI**    | `gpt-5.2-chat-latest`       | 1000      | 15          | 16K           |
| **Dashscope** | `qwen-plus`                 | 200       | 8           | 8K            |
| **DeepSeek**  | `deepseek-chat`             | 200       | 8           | 8K            |
| **Gemini**    | `gemini-3-flash`            | 500       | 12          | 16K           |
| **Anthropic** | `claude-haiku-4-5-20251001` | 50        | 5           | 200K          |
| **XAI**       | `grok-4`                    | 300       | 10          | 8K            |

> **Note:** These are the default limits when using the configuration shown in [`localize.config.ts`](../localize.config.ts). Limits are configurable via `rateLimiter` in your configuration.

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

## Fallback Strategy

Locai implements a robust **Fallback Chain**. If your primary provider fails or hits a rate limit, the tool automatically switches to the next available provider.

**Default Chain:**
`OpenAI` → `Anthropic` → `Dashscope` → `DeepSeek` → `Gemini` → `XAI`

**Configuring Fallback:**

```typescript
// localize.config.ts
export default {
	useFallback: true,
	fallbackOrder: ["openai", "anthropic", "dashscope", "deepseek", "gemini", "xai"],
};
```
