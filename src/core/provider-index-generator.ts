import fs from "fs";
import path from "path";
import type { ServiceGroup } from "../types/types";
import { toClassName } from "../utils/naming-utils";
import {
  extractCustomCode,
  compileTemplate,
  writeGenerated,
} from "../utils/file-writer";

export function generateProviderIndex(params: {
  providerDir: string;
  interceptorsDir: string;
  templatesDir: string;
  corePathStr: string;
  services: Record<string, ServiceGroup>;
}): void {
  const { providerDir, interceptorsDir, templatesDir, corePathStr, services } =
    params;

  // Auto-discover interceptors
  const interceptorImports: { file: string; fn: string }[] = [];
  if (fs.existsSync(interceptorsDir)) {
    const entries = fs.readdirSync(interceptorsDir);
    for (const entry of entries) {
      if (
        entry === "index.ts" ||
        entry === "bearer-auth-manager.ts" ||
        !entry.endsWith(".ts")
      )
        continue;
      const filePath = path.join(interceptorsDir, entry);
      const content = fs.readFileSync(filePath, "utf8");
      const matches = content.matchAll(/export function (install\w+)/g);
      for (const m of matches) {
        interceptorImports.push({ file: entry.replace(/\.ts$/, ""), fn: m[1] });
      }
    }
  }

  // Auto-generate interceptors index
  const interceptorsIndexPath = path.join(interceptorsDir, "index.ts");
  const interceptorsIndexTemplate = compileTemplate(
    path.join(templatesDir, "interceptors-index.hbs"),
  );
  if (!fs.existsSync(path.dirname(interceptorsIndexPath))) {
    fs.mkdirSync(path.dirname(interceptorsIndexPath), { recursive: true });
  }
  writeGenerated(
    interceptorsIndexPath,
    interceptorsIndexTemplate({ 
      interceptors: interceptorImports,
      hasAuthManager: fs.existsSync(path.join(interceptorsDir, "bearer-auth-manager.ts"))
    }),
  );
  console.log(`Generated interceptors/index.ts`);

  // Auto-generate provider index.ts
  const indexPath = path.join(providerDir, "index.ts");
  const indexCustomCode = extractCustomCode(indexPath);

  let relInterceptorsPath = path
    .relative(providerDir, interceptorsDir)
    .replace(/\\/g, "/");
  if (!relInterceptorsPath.startsWith("."))
    relInterceptorsPath = "./" + relInterceptorsPath;

  const indexData = {
    hasHooks: fs.existsSync(path.join(providerDir, "hooks.ts")),
    corePath: corePathStr,
    interceptorsPath: relInterceptorsPath,
    tags: Object.keys(services).map((t) => ({
      tag: t.toLowerCase(),
      className: toClassName(t),
    })),
    interceptors: interceptorImports,
    customCode: indexCustomCode,
  };

  const indexTemplate = compileTemplate(path.join(templatesDir, "index.hbs"));
  writeGenerated(indexPath, indexTemplate(indexData));
  console.log(`Generated provider index.ts`);
}
