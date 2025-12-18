# Development Guide

Want to contribute to Locai? Here is everything you need to know to set up your environment and understand the codebase.

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ahmetenesdur/locai.git
    cd locai
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install (recommended)
    # or
    npm install
    ```

## Development Commands

| Command       | Description                                          |
| ------------- | ---------------------------------------------------- |
| `pnpm dev`    | Run the CLI locally using `ts-node` (Fast iteration) |
| `pnpm build`  | Compile TypeScript to JavaScript in `dist/`          |
| `pnpm start`  | Run the compiled version from `dist/`                |
| `pnpm test`   | Run unit tests with Vitest                           |
| `pnpm format` | Format code with Prettier                            |
| `pnpm lint`   | Lint code with ESLint                                |

## Project Structure

```
src/
├── commands/         # CLI command definitions
│   ├── translator.ts     # Main logic for 'translate'
│   └── review.ts         # TUI for 'review'
├── core/             # Core logic
│   ├── orchestrator.ts   # The brain: manages pipeline
│   ├── pipeline/         # Translation steps (Validate -> Cache -> Translate)
│   ├── context-processor.ts # AI context analysis
│   └── provider-factory.ts # Manages OpenAI, Gemini, etc.
├── services/         # Business logic
│   └── translation-service.ts # High-level coordination
├── providers/        # AI API Wrappers
├── utils/            # Shared utilities
│   ├── confidence-scorer.ts
│   └── glossary-manager.ts
└── cli.ts            # Entry point
```

## Testing

We use **Vitest** for testing.

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch
```

## Contributing Workflow

1.  Create a feature branch: `git checkout -b feature/amazing-feature`
2.  Make your changes.
3.  Add tests if applicable.
4.  format code: `pnpm format`
5.  Push and open a PR!
