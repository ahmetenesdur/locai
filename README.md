# Locai

**The Universal AI Localization Engine.**

Locai brings human-quality AI localization to **any project** (Next.js, Flutter, Android, iOS, Python) and **any file format** with a single command. It fits right into your workflow, whether you're a solo dev or an enterprise team.

## 🚀 Quick Start

Translate your project in seconds without installing anything:

```bash
# Translates your ./locales from English to Turkish, Spanish, and German
npx locai translate --source en --targets tr,es,de
```

## 📖 Documentation

Everything you need to know to master Locai.

### [Getting Started](./docs/getting-started.md)

Introduction, installation options, and setting up your API keys.

### [Configuration Guide](./docs/configuration.md)

Detailed guide on `localize.config.ts`, supported file formats (`json`, `yaml`, `po`, `arb`), and advanced settings.

### [CLI Reference](./docs/cli-reference.md)

Master the command line. Learn about `translate`, `fix`, `review`, and `analyze`.

### [Providers](./docs/providers.md)

Choose the right brain for your localization. Compare OpenAI, Gemini, DeepSeek, and more.

### [Core Concepts](./docs/concepts.md)

Deep dive into Locai's intelligent features. We didn't just wrap an API; we built a localization engine.

- **Infinite Memory**: Vector-based caching. We "remember" every translation. If you translate the same (or similar) sentence again, we fetch it from local cache instantly. Zero cost, 100% consistency.
- **Smart Sync**: We hash every key. Locai only translates **new** or **modified** keys. If you have 1000 keys and change 5, we only send 5 to the AI.
- **Context Awareness**: Locai analyzes your content. It knows if a string is for a **Button** (keep it short), **Marketing** (make it punchy), or **Legal** (be precise).
- **Glossary & Brand Safety**: Define immutable terms (like "Locai", "API", "SaaS"). We guarantee they are never translated or corrupted.
- **Auto-Fix Engine**: Did the AI forget a closing quote? Or mess up a `{placeholder}`? Locai detects these syntax errors and fixes them automatically before saving.
- **Multi-Provider Fallback**: OpenAI down? Rate limit hit? Locai automatically switches to Gemini, DeepSeek, or other configured providers without breaking the build.
- **Confidence Scoring**: Every translation gets a score (0-1). Low confidence translations are flagged for your review.
- **Interactive Review**: A built-in Terminal UI (TUI) to manually approve or edit translations that need attention.

### [Development Guide](./docs/development.md)

Contributing to Locai? Learn how to build, test, and run the project locally.

## ✨ Why Locai?

- **Framework Agnostic**: Works with Next.js, Flutter, Django, and more.
- **Context Aware**: Knows the difference between "Home" (House) and "Home" (Page).
- **Cost Efficient**: Smart caching and incremental updates save ~90% of AI costs.
- **Developer Friendly**: TypeScript config, type safety, and great error messages.

## 🤝 Community & Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

This project is governed by a [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
