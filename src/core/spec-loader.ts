import fs from "fs";
import type { OpenApiSpec } from "../types/types";

interface CacheEntry {
  spec: OpenApiSpec;
  /** file mtime or ETag for URLs */
  etag: string;
}

const specCache = new Map<string, CacheEntry>();

/** Clear the spec cache (useful in tests). */
export function clearSpecCache(): void {
  specCache.clear();
}

export async function loadSpec(specSource: string): Promise<OpenApiSpec> {
  const isUrl =
    specSource.startsWith("http://") || specSource.startsWith("https://");

  if (isUrl) {
    // For URLs: use HEAD to check ETag, skip fetch if cached
    try {
      const headRes = await fetch(specSource, { method: "HEAD" });
      const etag =
        (headRes.headers && typeof headRes.headers.get === 'function' && headRes.headers.get("etag")) ||
        (headRes.headers && typeof headRes.headers.get === 'function' && headRes.headers.get("last-modified")) ||
        "";
      const cached = specCache.get(specSource);
      if (cached && etag && cached.etag === etag) {
        return cached.spec;
      }
    } catch {
      /* fall through to full fetch */
    }

    console.log(`\nFetching OpenAPI spec from ${specSource}...`);
    const res = await fetch(specSource);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(
          `OpenAPI spec not found at ${specSource} — is your backend running?`,
        );
      }
      throw new Error(
        `Failed to fetch OpenAPI spec from ${specSource}: HTTP ${res.status} ${res.statusText}`,
      );
    }
    const spec = (await res.json()) as OpenApiSpec;
    const etag =
      (res.headers && typeof res.headers.get === 'function' && res.headers.get("etag")) ||
      (res.headers && typeof res.headers.get === 'function' && res.headers.get("last-modified")) ||
      Date.now().toString();
    specCache.set(specSource, { spec, etag });
    return spec;
  }

  console.log(`\nLoading OpenAPI spec from ${specSource}...`);
  if (!fs.existsSync(specSource)) {
    throw new Error(
      `OpenAPI spec file not found at ${specSource} — check the file path`,
    );
  }
  try {
    const mtime = fs.statSync(specSource).mtimeMs.toString();
    const cached = specCache.get(specSource);
    if (cached && cached.etag === mtime) {
      return cached.spec;
    }
    const spec = JSON.parse(fs.readFileSync(specSource, "utf8")) as OpenApiSpec;
    specCache.set(specSource, { spec, etag: mtime });
    return spec;
  } catch (e) {
    throw new Error(
      `Failed to parse OpenAPI spec from ${specSource}: ${(e as Error).message}`,
    );
  }
}
