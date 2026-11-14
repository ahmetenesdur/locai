# CLI Reference

All commands support `--help` to show their options.

## Global Options

These options apply to every command. They can be given before or after the command name (`locai --debug translate` and `locai translate --debug` are the same).

| Option                  | Description                                                      | Default                                |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `-s, --source <lang>`   | Source language code                                             | `config.source`                        |
| `-t, --targets <langs>` | Comma-separated target languages                                 | `config.targets`                       |
| `--localesDir <dir>`    | Path to the locales directory                                    | `config.localesDir` (or auto-detected) |
| `--no-deep-context`     | Disable deep context analysis (source code scanning)             | `config.deepContext` (on)              |
| `--debug`               | Debug output; sets `debug` and `advanced.debug`                  | `config.debug`                         |
| `--verbose`             | Detailed diagnostic output; sets `verbose` and `logging.verbose` | `config.logging.verbose`               |
| `-V, --version`         | Print the version                                                |                                        |
| `-h, --help`            | Show help                                                        |                                        |

An option you do not pass keeps the value from your config file.

## Commands

### `translate` (Default)

Translates missing keys in your locale files.

```bash
locai translate [options]
# OR simply (global options only)
locai
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--provider <name>` | Translation provider (openai, anthropic, etc.) | `config.apiProvider` |
| `--concurrency <num>` | Number of concurrent translations (1-20) | `config.concurrencyLimit` |
| `--no-cache` | Disable the translation cache | cache on |
| `--force` | Re-translate keys that already exist in the target files | `config.forceUpdate` |
| `--length <mode>` | Length control mode: `strict`, `flexible`, `exact`, `relaxed`, `smart` | `config.lengthControl.mode` or `smart` |
| `--auto-optimize` | Pick the concurrency from your CPU count and memory | `config.advanced.autoOptimize` |
| `--min-confidence <0-1>` | Turn on confidence scoring; translations scoring below this value are flagged for review | `config.minConfidence` |
| `--save-review-queue` | Turn on confidence scoring and save flagged translations to `.localize-cache/review-queue.json` for `locai review` | `config.saveReviewQueue` |
| `--stats` | No effect: the full summary is always shown | |

`--min-confidence` alone does not write the review queue file; add `--save-review-queue` for that. A `--min-confidence` value outside 0-1 is ignored with a warning, and the config value is used.

### `fix`

Checks existing translations against the length rules and re-translates the ones that fail. Other issues (quotes, placeholders, etc.) are not fixed by this command.

```bash
locai fix
```

**Options:**
| Option | Description |
|--------|-------------|
| `--length` | Fix length issues. Always on; accepted for compatibility |

### `review`

Starts an interactive Terminal UI (TUI) to review low-confidence translations.

```bash
locai review
```

**Options:**
| Option | Description |
|--------|-------------|
| `--export <format>` | Export the review queue to `json` or `csv` instead of interactive mode |

### `analyze` (Not implemented)

Not implemented yet. The command loads the config and finds the source files, then stops; it does not analyze anything. Its options are accepted but have no effect.

| Option                          | Description                  |
| ------------------------------- | ---------------------------- |
| `--use-ai`                      | No effect yet                |
| `--context-provider <provider>` | No effect yet                |
| `--context-threshold <num>`     | No effect yet (must be 1-10) |

### `validate-config`

Validates your configuration file and environment without running any translations. Useful for CI/CD pipelines.

```bash
locai validate-config --show-warnings
```

**Options:**
| Option | Description |
|--------|-------------|
| `--show-warnings` | Show configuration warnings |

### `advanced`

Runs a translation like `translate`, with these context and retry settings overridden. It does not accept the `translate` options.

```bash
locai advanced [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--context-confidence <0-1>` | Minimum confidence for context detection (`context.detection.minConfidence`) | config value |
| `--min-text-length <num>` | Minimum text length before AI context analysis is used (`context.minTextLength`) | config value |
| `--allow-new-categories` | Allow AI context analysis to suggest new categories | config value |
| `--max-retries <num>` | Maximum number of API retries (`retryOptions.maxRetries`) | config value or 2 |
| `--context-debug` | No effect (not implemented) | |

## Examples

**Production Build Run:**

```bash
locai translate --min-confidence 0.9 --save-review-queue
```

**Quick Fix:**

```bash
locai fix
```

**Switch Provider on the Fly:**

```bash
locai translate --provider deepseek
```
