# Getting Started with Locai

**Locai** is a CLI that translates JSON locale files with an AI provider.

## Prerequisites

Before you begin, ensure you have:

- **Node.js**: 20.19 or later, or 22 and later.
- **API Key**: At least one AI provider key (OpenAI, Gemini, DeepSeek, Anthropic, XAI, or Dashscope).

## Installation

You can run Locai without installing it via `npx`, or install it globally or as a dev dependency.

### 1. Without Installing

Run it in your project root. By default Locai reads `./locales`; set `localesDir` in your config (or pass `--localesDir`) if your files are elsewhere.

```bash
npx locai translate --source en --targets tr,es,de
```

> For complex projects, we recommend creating a configuration file. See the [Configuration Guide](./configuration.md) for details.

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

Create a `.env` file (or `.env.local`) in your project root. Locai loads both. Values in `.env.local` override `.env` and variables already set in your shell; values in `.env` do not override your shell.

```env
# Required: At least one of these
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
DASHSCOPE_API_KEY=sk-...
XAI_API_KEY=xai-...

# Optional: extra output
DEBUG=true
VERBOSE=true
```

## First Run

Run Locai from your project root. If you have no config file, pass the languages:

```bash
npx locai --source en --targets tr,es,de
```

Locai will:

1.  Find the source file in `localesDir` (default `./locales`): `<source>/translation.json` first, then `<source>.json`. The nested layout requires the file name `translation.json`.
2.  Compare each target file with the source and collect keys that are new, whose source text changed, or that are missing from the target.
3.  Translate them using the configured AI provider.
4.  Create or update the target files (`<target>.json` or `<target>/translation.json`, matching the source layout).

## Next Steps

- [Configuration Guide](./configuration.md) - Learn how to customize Locai.
- [CLI Reference](./cli-reference.md) - Explore all commands and flags.
- [Core Concepts](./concepts.md) - Understand how Locai maintains quality and context.
