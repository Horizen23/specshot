export interface PresetInfo {
  name: string;
  description: string;
  features: string[];
  deps: string[];
}

export const PRESETS: PresetInfo[] = [
  {
    name: "class",
    description: "Class-based services with Zod validation, ApiClient, and plugin system",
    features: [
      "BaseService + ApiClient class architecture",
      "Zod runtime validation",
      "Plugin system (bearer auth, logger, etc.)",
      "SWR or React Query hooks support",
      "Promise<{ data, error, ok }> result pattern",
    ],
    deps: ["zod"],
  },
  {
    name: "functional",
    description: "Standalone async functions with native fetch(). No dependencies, no classes.",
    features: [
      "Standalone export async functions (no class)",
      "Native fetch() — zero runtime dependencies",
      "Plain TypeScript types (no Zod)",
      "setBaseUrl() / getBaseUrl() configuration",
      "Promise<T> with throws on error (try/catch pattern)",
      "Custom ApiError class",
    ],
    deps: [],
  },
  {
    name: "zod-functional",
    description: "Standalone async functions with Zod schemas. No classes, but runtime validation included.",
    features: [
      "Standalone export async functions (no class)",
      "Native fetch() — no ApiClient dependency",
      "Zod schemas + inferred types",
      "Schema registry for runtime validation",
      "setBaseUrl() / getBaseUrl() configuration",
      "Promise<T> with throws on error (try/catch pattern)",
      "Custom ApiError class",
    ],
    deps: ["zod"],
  },
];

export const DEFAULT_PRESET = "class";

export function getPresetInfo(name: string): PresetInfo | undefined {
  return PRESETS.find((p) => p.name === name);
}

export function isValidPreset(name: string): boolean {
  return PRESETS.some((p) => p.name === name);
}
