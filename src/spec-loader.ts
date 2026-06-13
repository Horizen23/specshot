import fs from "fs";
import type { OpenApiSpec } from "./types";

export async function loadSpec(specSource: string): Promise<OpenApiSpec> {
  const isUrl = specSource.startsWith("http://") || specSource.startsWith("https://");

  if (isUrl) {
    console.log(`\nFetching OpenAPI spec from ${specSource}...`);
    const res = await fetch(specSource);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`OpenAPI spec not found at ${specSource} — is your backend running?`);
      }
      throw new Error(
        `Failed to fetch OpenAPI spec from ${specSource}: HTTP ${res.status} ${res.statusText}`,
      );
    }
    return (await res.json()) as OpenApiSpec;
  }

  console.log(`\nLoading OpenAPI spec from ${specSource}...`);
  if (!fs.existsSync(specSource)) {
    throw new Error(`OpenAPI spec file not found at ${specSource} — check the file path`);
  }
  try {
    return JSON.parse(fs.readFileSync(specSource, "utf8")) as OpenApiSpec;
  } catch (e) {
    throw new Error(
      `Failed to parse OpenAPI spec from ${specSource}: ${(e as Error).message}`,
    );
  }
}
