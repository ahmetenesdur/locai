# Development Guide

How to set up the repository, run it locally, and find your way around the code.

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ahmetenesdur/locai.git
    cd locai
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    # or
    npm install
    ```

## Development Commands

| Command              | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`           | Run the CLI from source with `tsx` (`tsx src/cli.ts`), e.g. `pnpm dev translate`     |
| `pnpm build`         | Compile `src/` to JavaScript in `dist/` (`tsconfig.build.json`)                      |
| `pnpm start`         | Run the compiled CLI (`node dist/cli.js`); run `pnpm build` first                    |
| `pnpm test`          | Run the unit and integration tests once with Vitest                                  |
| `pnpm test:watch`    | Run Vitest in watch mode                                                             |
| `pnpm test:coverage` | Run the tests with a coverage report                                                 |
| `pnpm typecheck`     | Type-check `src/`, `tests/` and the root `*.ts` files without emitting               |
| `pnpm format`        | Format code with Prettier (`pnpm format:check` only checks)                          |
| `pnpm lint`          | Lint the repository with ESLint and typescript-eslint (`docs/` and fixtures ignored) |

## Project Structure

```
src/
├── cli.ts            # Entry point: CLI options and commands
├── cli/helpers.ts    # Builds the run config from options and dispatches commands
├── config/           # Config loading (c12), defineConfig, environment setup
├── commands/
│   ├── translator.ts     # Thin wrappers used by translate and fix
│   └── review.ts         # TUI for 'review'
├── core/             # Core logic
│   ├── orchestrator.ts   # Builds and runs the translation pipeline
│   ├── pipeline/         # Translation steps (validate, cache, glossary, translate, quality, ...)
│   ├── context-processor.ts # Keyword and optional AI category detection
│   └── provider-factory.ts # Manages OpenAI, Gemini, etc.
├── services/
│   ├── translation-service.ts # Sync analysis, translate and fix runs
│   └── language-processor.ts  # Per-language translation and file writes
├── providers/        # AI API Wrappers
├── utils/            # Shared utilities
│   ├── confidence-scorer.ts
│   └── glossary-manager.ts
└── types/
```

## Testing

We use **Vitest** for testing.

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Contributing Workflow

1.  Create a feature branch: `git checkout -b feature/amazing-feature`
2.  Make your changes.
3.  Add tests if applicable.
4.  Format code: `pnpm format`
5.  Run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
6.  Push and open a PR.
