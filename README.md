# Locai

[![CI](https://github.com/ahmetenesdur/locai/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ahmetenesdur/locai/actions/workflows/ci.yml)

**AI translation for JSON locale files.**

Locai translates the JSON locale files of your project (`en.json` or `en/translation.json`) with an AI provider of your choice, from a single command. It works with any project that keeps its translations in JSON, for example Next.js, React or Vue apps using i18next.

## 🚀 Quick Start

Run it with `npx`, without installing anything:

```bash
# Translates your ./locales from English to Turkish, Spanish, and German
npx locai translate --source en --targets tr,es,de
```

> **Need a permanent setup?** See the [Configuration Guide](./docs/configuration.md) to create a `localize.config.ts` file.

## 📖 Documentation

### [Getting Started](./docs/getting-started.md)

Introduction, installation options, and setting up your API keys.

### [Configuration Guide](./docs/configuration.md)

Detailed guide on `localize.config.ts`, the supported locale file layouts, and advanced settings.

### [CLI Reference](./docs/cli-reference.md)

Learn about `translate`, `fix`, `review`, and `validate-config`.

### [Providers](./docs/providers.md)

Supported providers (OpenAI, Anthropic, Gemini, DeepSeek, Dashscope, XAI), their default models, API keys, rate limits and fallback.

### [Core Concepts](./docs/concepts.md)

How Locai's features work:

- **Context Categories**: You define categories (keywords plus a prompt) in `context.categories`. When a string contains enough of a category's keywords, that category's prompt is added to the translation request. There are no built-in categories. AI classification of longer strings is optional (`context.useAI`, off by default).
- **Deep Context Analysis**: Finds where each key is used in your TypeScript/TSX code (`t("key")` calls) and sends that usage with the translation request: file and line, component name, nearby comments, JSX props and a short code snippet. Turn it off with `deepContext: false` or `--no-deep-context`.
- **Vector Memory (optional)**: With `vectorMemory.enabled: true`, Locai stores OpenAI embeddings of translated strings in a local database. Near-identical strings (similarity ≥ 0.98) reuse the stored translation without a translation call; similar ones (≥ 0.85) are given to the model as a reference. Requires `OPENAI_API_KEY`, and each new string costs an embedding request.
- **Smart Sync**: Locai stores a hash of each source string. A key is translated when it is missing from a target file or its source text changed since the last run. If you have 1000 translated keys and change 5, only those 5 are sent to the AI. Keys removed from the source file are removed from the target files.
- **Glossary & Brand Safety**: Define protected terms (like "Locai", "API", "SaaS"). Locai swaps them for placeholder tokens in the text being translated, then restores your configured translation, so the model does not see or translate those terms in that text. (Source code sent by Deep Context Analysis is not tokenized.)
- **Auto-Fix**: After each translation, rule-based checks repair what they can: unbalanced quotes, missing or damaged placeholders (`{name}`, `${name}`, `%s`, `%d`), HTML tags and ending punctuation, plus markdown, code blocks and special characters if you turn those rules on. The checks do not reject a translation.
- **Provider Fallback**: With `useFallback` (on by default), a failed request is retried with the other providers that have an API key set.
- **Confidence Scoring**: Every translation gets a score (0-1). Low confidence translations are flagged for your review.
- **Interactive Review**: A built-in Terminal UI (TUI) to manually approve or edit translations that need attention.

### [Development Guide](./docs/development.md)

Contributing to Locai? Learn how to build, test, and run the project locally.

## ✨ Why Locai?

- **JSON Locale Files**: Works with any project that stores translations as JSON (`<lang>.json` or `<lang>/translation.json`).
- **Fewer API Calls**: Only new, changed or missing keys are sent to the AI. Strings already translated in the current run, or found in vector memory when it is enabled, are reused instead of triggering another translation call.
- **Flat or Nested Layout**: Supports flat (`en.json`) and nested (`en/translation.json`) layouts. Target files are written in the same layout as the source file. The nested layout requires the file name `translation.json`.
- **TypeScript Config**: `localize.config.ts` with types via `defineConfig` from `locai/config`.

## 🤝 Community & Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

This project is governed by a [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
