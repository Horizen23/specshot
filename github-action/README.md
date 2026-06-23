# SpecShot Generate — GitHub Action

Auto-generate strictly-typed TypeScript API clients from your OpenAPI spec on every push or PR.

> **Never merge with stale API types again.** This action runs `npx specshot generate` in CI and optionally auto-commits the output.

## Quick Start

```yaml
# .github/workflows/specshot.yml
name: Generate API Client

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Horizen23/specshot/github-action@main
        with:
          openapi-url: ${{ secrets.API_SPEC_URL }}
          output-dir: src/lib/api/default/services
          commit-message: "chore(api): auto-generate typed client from spec"
```

## Inputs

| Input               | Required | Default              | Description                                                            |
| ------------------- | -------- | -------------------- | ---------------------------------------------------------------------- |
| `openapi-url`       | \*       | —                    | Remote OpenAPI JSON URL (e.g., `https://api.example.com/openapi.json`) |
| `openapi-file`      | \*       | —                    | Local path to OpenAPI JSON file                                        |
| `output-dir`        | No       | From `specshot.json` | Where to write generated files                                         |
| `config-path`       | No       | `./specshot.json`    | Path to project config                                                 |
| `commit-message`    | No       | —                    | If set, auto-commits generated files with this message                 |
| `working-directory` | No       | `.`                  | Monorepo subdirectory                                                  |

_\*Either `openapi-url` or `openapi-file` must be provided._

## Recipes

### PR Validation (fail if spec is unreachable)

```yaml
name: Validate API Contract

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Horizen23/specshot/github-action@main
        with:
          openapi-url: ${{ secrets.API_SPEC_URL }}
          # No commit-message → fails if spec is down
```

### Monorepo multi-service

```yaml
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Horizen23/specshot/github-action@main
        with:
          openapi-url: https://user-service.example.com/openapi.json
          output-dir: packages/user-api/src/services
          config-path: packages/user-api/specshot.json

      - uses: Horizen23/specshot/github-action@main
        with:
          openapi-url: https://order-service.example.com/openapi.json
          output-dir: packages/order-api/src/services
          config-path: packages/order-api/specshot.json
```

### Local spec file (bundled in repo)

```yaml
- uses: Horizen23/specshot/github-action@main
  with:
    openapi-file: specs/api.json
    output-dir: src/lib/api/services
    commit-message: "chore: update API client from spec changes"
```

## Behavior

- If the spec URL returns **non-200**, the workflow **fails** (contract enforcement).
- If `commit-message` is set, the action auto-commits generated files and pushes.
- If `commit-message` is **omitted**, files are generated but not committed — useful for PR validation.

## Prerequisites

1. Run `npx specshot init` locally first to scaffold the core/provider files.
2. Your project needs a `specshot.json` (created by `init`) or pass `output-dir` explicitly.

## See Also

- [SpecShot CLI](https://github.com/Horizen23/specshot) — the generator this action wraps
- [SpecShot Docs](https://github.com/Horizen23/specshot#readme)
