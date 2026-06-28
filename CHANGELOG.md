# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> **Note:** This project is pre-v1.0. Breaking changes may occur in minor releases as the API stabilizes.

### Added

- `templates eject` command to copy built-in Handlebars templates for local customization.
- `templates list` command to show all templates and their override status.
- `templates context <name>` command to show available variables for a template.
- Built-in template presets: `class` (default), `functional`, `zod-functional`.
- `--preset` flag on `init`, `generate`, and `templates eject` commands.
- `preset` field in `specshot.config.mjs`.
- Partial template override: only edited templates override built-ins, missing files fall back to defaults.
- Per-file template override via CLI flags (`--template-models`, `--template-service`, etc.) and config object.
- MSW template override support via `msw/` subdirectory in custom templates dir.
- WebSocket support in mock server with dashboard UI for real-time event triggering.
- `--msw` flag on `generate` command for MSW mock handler generation.
- Custom output paths: configure WHERE generated files go (`outputPaths` in config).
- Handlebars naming helpers: `capitalize`, `camelCase`, `pascalCase`, `kebabCase`, `snakeCase`, `toLowerCase`, `toUpperCase`, `ifEq`, `ifNeq`.
- File naming configuration: control generated file names via `fileNaming` in config with naming helper support.
- `tsType` field in template context for custom templates to use plain TS types instead of Zod.
- Init/generate separation: `init` creates config only, `generate` installs core/provider + generates code.
- Auto-install infrastructure: `generate` installs core/provider/interceptors if missing (built-in templates only).
- `--dry-run` now validates template files exist and compile before writing.
- Improved template error messages: file name, path, and context in errors.
- Template registry (`src/core/template-registry.ts`) for centralized template metadata.
- Design patterns example (Singleton, Factory, Observer, Builder).
- Custom output paths example with no Zod, no ApiClient, native fetch.
- Naming helpers POC example.

### Changed

- Custom templates now support partial override instead of requiring all 5 generator templates.
- `--templates` flag on `generate` and `init` supports partial override with automatic fallback.
- `init` now only writes config file; `generate` handles all file installation.
- Type names use PascalCase: `PetsListPetsResponse` instead of `petsListPetsResponse`.
- MSW handler functions use PascalCase: `getPetsHandlers` instead of `getpetsHandlers`.
- `toClassName()` now capitalizes first letter (e.g. `PetsService` not `petsService`).
- Empty `interceptors/index.ts` (from custom templates) is no longer written.

- Initial `init` command to scaffold the agnostic API client core into a project.
- Initial `generate` command to generate strictly-typed TypeScript services from OpenAPI/Swagger specs.
- Template system using Handlebars for code generation.
- Agnostic core templates: `ApiClient`, `BaseService`, and shared types.
- Service generation templates: service files, model types, Zod schemas.
- Built-in interceptor templates: Bearer token auth, request/response logger.
- SWR integration hooks template.
- Interactive CLI with commander, inquirer, chalk, and ora.
