# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> **Note:** This project is pre-v1.0. Breaking changes may occur in minor releases as the API stabilizes.

### Added

- `templates` command to eject built-in Handlebars templates for local customization.
- Partial template override: only edited templates override built-ins, missing files fall back to defaults.
- MSW template override support via `msw/` subdirectory in custom templates dir.
- WebSocket support in mock server with dashboard UI for real-time event triggering.
- `--msw` flag on `generate` command for MSW mock handler generation.

### Changed

- Custom templates now support partial override instead of requiring all 5 generator templates.
- `--templates` flag on `generate` and `init` supports partial override with automatic fallback.

- Initial `init` command to scaffold the agnostic API client core into a project.
- Initial `generate` command to generate strictly-typed TypeScript services from OpenAPI/Swagger specs.
- Template system using Handlebars for code generation.
- Agnostic core templates: `ApiClient`, `BaseService`, and shared types.
- Service generation templates: service files, model types, Zod schemas.
- Built-in interceptor templates: Bearer token auth, request/response logger.
- SWR integration hooks template.
- Interactive CLI with commander, inquirer, chalk, and ora.
