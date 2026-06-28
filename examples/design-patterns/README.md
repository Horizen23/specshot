# Design Patterns — Service Template Examples

This example shows **5 different design patterns** for generating API service
templates with SpecShot. Each pattern produces a different code structure from
the same OpenAPI spec — pick the one that fits your architecture.

## Patterns

| Pattern | Template | Use Case |
|---------|----------|----------|
| **Singleton** | `singleton-service.hbs` | Single shared instance across app, with built-in caching |
| **Factory** | `factory-service.hbs` | Multi-environment (prod/staging/test), per-tenant instances |
| **Observer** | `observer-service.hbs` | Event-driven: subscribe to before/after/error lifecycle |
| **Builder** | `builder-service.hbs` | Fluent API for complex requests with chained config |

## Quick Comparison

### Singleton
```ts
import { petsService } from "./services/pets.service";

petsService.setBaseUrl("https://api.example.com");
const pets = await petsService.listPets();      // cached
const same = await petsService.listPets();      // cache hit
```

### Factory
```ts
import { PetsServiceFactory } from "./services/pets.service";

const prod = PetsServiceFactory.createProduction();
const staging = PetsServiceFactory.createStaging();
const authed = PetsServiceFactory.createWithAuth("https://api.example.com", token);

const pets = await prod.listPets();
```

### Observer
```ts
import { petsService } from "./services/pets.service";

// Log all requests
petsService.on((e) => console.log(`[${e.type}] ${e.method} ${e.url} (${e.durationMs}ms)`));

// Loading indicators
petsService.onBefore(() => setLoading(true));
petsService.onAfter(() => setLoading(false));

// Error reporting
petsService.onError((e) => Sentry.captureException(e.error));

const pets = await petsService.listPets();
```

### Builder
```ts
import { listPets } from "./services/pets.service";

setBaseUrl("https://api.example.com");

const pets = await listPets()
  .auth(token)
  .timeout(5000)
  .retries(3)
  .execute();
```

## Usage

Each template is a standalone `service.hbs` replacement. To use one:

```bash
# 1. Copy the pattern you want
cp templates/singleton-service.hbs templates/service.hbs

# 2. Copy shared templates (models, types, index, interceptors-index)
cp templates/shared/* templates/

# 3. Generate
npx specshot generate --templates ./templates
```

## Shared Templates

All patterns share the same supporting templates (`models.hbs`, `types.hbs`,
`index.hbs`, `plugins-index.hbs`). Only `service.hbs` differs per pattern.

## File Structure

```
.specshot/templates/presets/
├── singleton/
│   └── templates/api/
│       ├── service-per-tag/service.hbs  ← Singleton pattern
│       ├── index/index.hbs
│       ├── models/models.hbs
│       ├── types-per-tag/types.hbs
│       └── plugins/plugins-index.hbs
├── factory/
│   └── templates/api/...               ← Factory pattern
├── observer/
│   └── templates/api/...               ← Observer pattern
└── builder/
    └── templates/api/...               ← Builder pattern
```
