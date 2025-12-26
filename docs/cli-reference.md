# CLI Reference

Locai's CLI is built to be intuitive. All commands support `--help` to show available options.

## Global Options

These options apply to all commands.

| Option                  | Description                       | Default          |
| ----------------------- | --------------------------------- | ---------------- |
| `-s, --source <lang>`   | Source language code              | `config.source`  |
| `-t, --targets <langs>` | Comma-separated target languages  | `config.targets` |
| `--localesDir <path>`   | Path to locales directory         | Auto-detected    |
| `--debug`               | Enable verbose debug logging      | `false`          |
| `--verbose`             | Enable detailed diagnostic output | `false`          |

## commands

### `translate` (Default)

Translates missing keys in your locale files.

```bash
locai translate [options]
# OR simply
locai
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--provider <name>` | Translation provider (openai, anthropic, etc.) | Configured provider |
| `--concurrency <num>` | Number of concurrent requests | 5 |
| `--no-cache` | Disable caching | `false` |
| `--no-deep-context` | Disable source code context analysis | `false` |
| `--force` | Force re-translation of existing keys | `false` |
| `--min-confidence <0-1>` | Set threshold for "Low Confidence" flagging | |
| `--save-review-queue` | Save flagged translations for later review | |
| `--stats` | Show detailed statistics after run | |

### `fix`

Scans existing translations for common issues (unbalanced quotes, broken placeholders) and fixes them automatically.

```bash
locai fix
```

### `review`

Starts an interactive Terminal UI (TUI) to review low-confidence translations.

```bash
locai review
```

**Options:**
| Option | Description |
|--------|-------------|
| `--export <format>` | Export the review queue to `json` or `csv` instead of interactive mode |

### `analyze` (Experimental)

Analyzes your content to detect context patterns using AI.

```bash
locai analyze --use-ai
```

### `validate-config`

Validates your configuration file and environment without running any translations. Useful for CI/CD pipelines.

```bash
locai validate-config --show-warnings
```

## Examples

**Production Build Run:**

```bash
locai translate --min-confidence 0.9 --save-review-queue --stats
```

**Quick Fix:**

```bash
locai fix
```

**Switch Provider on the Fly:**

```bash
locai --provider deepseek
```
