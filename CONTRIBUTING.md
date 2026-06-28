# Contributing to SpecShot

## Setup

```bash
git clone https://github.com/Horizen23/specshot.git
cd specshot
npm install
```

## Scripts

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run build`      | Build the CLI (tsup)       |
| `npm run dev`        | Watch mode for development |
| `npm test`           | Run tests (vitest)         |
| `npm run test:watch` | Run tests in watch mode    |
| `npm run lint`       | Type check (tsc --noEmit)  |

## Project Structure

```
src/
  cli/            CLI command handlers
  core/           Core engine & config loading
  lib/            Template rendering & generation logic
  types/          TypeScript type definitions
  utils/          Helper utilities
  __tests__/      Tests & fixtures
templates/        Built-in template presets (class, functional, zod-functional)
```

## Before Submitting a PR

1. Run tests: `npm test`
2. Run type check: `npm run lint`
3. Run build: `npm run build`

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance, dependencies
- `test:` adding/updating tests
- `docs:` documentation changes
