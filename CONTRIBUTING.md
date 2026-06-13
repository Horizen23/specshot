# Contributing to SpecShot

Thanks for your interest in contributing! This document outlines the workflow and conventions for contributing to this project.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/user/specshot.git
cd specshot

# Install dependencies
npm install

# Build the project
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev
```

## Project Structure

```
specshot/
├── src/
│   ├── cli.ts              # CLI entry point (commander + inquirer + ora)
│   └── generate.ts         # Code generator (OpenAPI parser + Handlebars rendering)
├── templates/
│   ├── core/               # Agnostic API client templates
│   │   ├── api-client.hbs
│   │   ├── base-service.hbs
│   │   └── types.hbs
│   ├── generator/          # Service generation templates
│   │   ├── index.hbs
│   │   ├── models.hbs
│   │   ├── service.hbs
│   │   ├── types.hbs
│   │   └── interceptors-index.hbs
│   ├── provider/           # Interceptor / provider templates
│   │   ├── client.hbs
│   │   ├── types.hbs
│   │   └── interceptors/
│   │       ├── bearer.hbs
│   │       ├── bearer-auth-manager.hbs
│   │       └── logger.hbs
│   └── integrations/
│       └── swr/
│           └── hooks.hbs
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

### Key Files

- **`src/cli.ts`** — CLI entry point. Handles the `init` and `generate` commands via commander, interactive prompts via inquirer, and progress spinners via ora.
- **`src/generate.ts`** — Core code generator. Fetches and parses OpenAPI/Swagger specs, resolves references, and renders templates using Handlebars.
- **`templates/core/`** — Templates for the agnostic API client that gets copied into the user's project during `init`.
- **`templates/generator/`** — Templates used to generate typed service files from an OpenAPI spec during `generate`.
- **`templates/provider/`** — Templates for built-in interceptors and providers that can be included in the generated output.

## How to Add New Templates

1. Create a new `.hbs` file in the appropriate `templates/` directory.
2. Use Handlebars syntax for dynamic content. Refer to existing templates for conventions (variable naming, indentation, etc.).
3. Register the template in `src/generate.ts` if it needs to be rendered during code generation, or in `src/cli.ts` if it's part of the init flow.
4. Test by running `npm run build` and then using the CLI to generate output against a real or mock OpenAPI spec.

## How to Add New Interceptors

1. Create a new `.hbs` template in `templates/provider/interceptors/`.
2. Follow the existing interceptor pattern (e.g., `bearer.hbs`, `logger.hbs`).
3. Register the new interceptor in `templates/provider/interceptors-index.hbs` so it's discoverable by users.
4. If the interceptor has a corresponding manager or utility, add it alongside in the same directory.

## Testing Guidelines

Currently, the project does not have an automated test suite. When adding tests:

- Use a testing framework compatible with ESM and TypeScript (e.g., Vitest).
- Test template rendering output against known OpenAPI fixtures.
- Test the CLI commands with mock prompts and file system assertions.
- Run `npm test` (once configured) before submitting a PR.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes, following the code style and conventions of the project.
3. Ensure the project builds successfully with `npm run build`.
4. Verify `npx tsc --noEmit` passes with no type errors.
5. Update documentation if your changes affect user-facing behavior.
6. Open a pull request against the `main` branch with a clear description of your changes.
7. Wait for review. Address any feedback or requested changes.

## Code Style

- TypeScript with ESM modules (`"type": "module"` in package.json).
- Use `import` / `export` syntax, not `require`.
- Prefer `const` and `let` over `var`.
- Use `async`/`await` for asynchronous operations.
- Keep CLI output user-friendly — use `chalk` for colors, `ora` for spinners, and `inquirer` for interactive prompts.
- Template files use Handlebars syntax. Keep templates readable with consistent indentation.
