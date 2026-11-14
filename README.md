# Locai

[![CI](https://github.com/ahmetenesdur/locai/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ahmetenesdur/locai/actions/workflows/ci.yml)

**AI translation for JSON locale files.**

Locai translates the JSON locale files of your project (`en.json` or `en/translation.json`) with an AI provider of your choice, from a single command. It works with any project that keeps its translations in JSON, for example Next.js, React or Vue apps using i18next.

## 🚀 Quick Start

Translate your project in seconds without installing anything:

```bash
# Translates your ./locales from English to Turkish, Spanish, and German
npx locai translate --source en --targets tr,es,de
```

> **Need a permanent setup?** See the [Configuration Guide](./docs/configuration.md) to create a `localize.config.ts` file.

## 📖 Documentation

Everything you need to know to master Locai.

### [Getting Started](./docs/getting-started.md)

Introduction, installation options, and setting up your API keys.

### [Configuration Guide](./docs/configuration.md)

Detailed guide on `localize.config.ts`, the supported locale file layouts, and advanced settings.

### [CLI Reference](./docs/cli-reference.md)

Learn about `translate`, `fix`, `review`, and `validate-config`.

### [Providers](./docs/providers.md)

Choose the right brain for your localization. Compare OpenAI, Gemini, DeepSeek, and more.

### [Core Concepts](./docs/concepts.md)

Deep dive into Locai's intelligent features. We didn't just wrap an API; we built a localization engine.

- **Smart Context Awareness**: Uses AI to understand the context of your strings for better translations.
- **Deep Context Analysis**: Scans your source code (AST) to extract component names, comments, and props for context-aware translations.
- **Infinite Memory**: Uses vector embeddings to remember previous translations and maintain consistency. If you translate the same (or similar) sentence again, we fetch it from local cache instantly. Zero cost, 100% consistency.
- **Smart Sync**: We hash every key. Locai only translates **new** or **modified** keys. If you have 1000 keys and change 5, we only send 5 to the AI.
- **Context Awareness**: Locai analyzes your content. It knows if a string is for a **Button** (keep it short), **Marketing** (make it punchy), or **Legal** (be precise).
- **Glossary & Brand Safety**: Define protected terms (like "Locai", "API", "SaaS"). Locai swaps them for placeholder tokens before the text reaches the AI, then restores your configured translation, so the model never sees the original term.
- **Auto-Fix Engine**: Did the AI forget a closing quote? Or mess up a `{placeholder}`? Locai detects these syntax errors and fixes them automatically before saving.
- **Multi-Provider Fallback**: OpenAI down? Rate limit hit? Locai automatically switches to Gemini, DeepSeek, or other configured providers without breaking the build.
- **Confidence Scoring**: Every translation gets a score (0-1). Low confidence translations are flagged for your review.
- **Interactive Review**: A built-in Terminal UI (TUI) to manually approve or edit translations that need attention.

### [Development Guide](./docs/development.md)

Contributing to Locai? Learn how to build, test, and run the project locally.

## ✨ Why Locai?

- **JSON Locale Files**: Works with any project that stores translations as JSON (`<lang>.json` or `<lang>/translation.json`).
- **Context Aware**: Knows the difference between "Home" (House) and "Home" (Page).
- **Cost Efficient**: Only new or changed keys are sent to the AI, and strings already translated in the current run or found in translation memory are reused instead of triggering another API call.
- **Flat or Nested Layout**: Supports flat (`en.json`) and nested (`en/translation.json`) layouts. Target files are written in the same layout as the source file. The nested layout requires the file name `translation.json`.
- **Developer Friendly**: TypeScript config, type safety, and great error messages.

## 🤝 Community & Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

This project is governed by a [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
