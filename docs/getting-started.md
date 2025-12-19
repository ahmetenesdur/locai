# Getting Started with Locai

**Locai** is designed to be the easiest localization tool you'll ever use. Whether you're a solo developer or part of a large enterprise team, getting started takes seconds.

## Prerequisites

Before you begin, ensure you have:

- **Node.js**: v14.13.0 or higher (v18+ recommended for ESM support).
- **API Key**: At least one AI provider key (OpenAI, Gemini, DeepSeek, Anthropic, XAI, or Dashscope).

## Installation

Locai is designed to be used without installation via `npx` (Zero-Config), but you can also install it globally or as a dev dependency.

### 1. Zero-Install (Recommended)

Run it directly in your project root. It will detect your framework and settings automatically.

```bash
npx locai translate --source en --targets tr,es,de
```

### 2. Global Installation

For frequent use across your system.

```bash
npm install -g locai

# Run anywhere
locai translate
```

### 3. Project Dependency

To enforce version consistency for your team.

```bash
pnpm add -D locai
# or
npm install --save-dev locai
```

## Setup API Keys

Creates a `.env` file in your project root. Locai will automatically load it.

```env
# Required: At least one of these
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
DASHSCOPE_API_KEY=sk-...
XAI_API_KEY=xai-...

# Optional: Debugging
DEBUG=true
```

## First Run

Navigate to your project directory (where your locales are, e.g., `./locales` or `./src/locales`) and run:

```bash
npx locai
```

Locai will:

1.  Detect your locale directory.
2.  Identify your source language files (e.g., `en.json`).
3.  Look for missing keys in target languages.
4.  Translate them using the configured AI.
5.  Generate or update your target files.

## Next Steps

- [Configuration Guide](./configuration.md) - Learn how to customize Locai.
- [CLI Reference](./cli-reference.md) - Explore all commands and flags.
- [Core Concepts](./concepts.md) - Understand how Locai maintains quality and context.
