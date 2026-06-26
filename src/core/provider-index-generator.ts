import fs from "fs";
import path from "path";
import type { ServiceGroup } from "../types/types";
import { toClassName } from "../utils/naming-utils";
import {
  extractCustomCode,
  compileTemplate,
  writeGenerated,
  resolveTemplatePath,
} from "../utils/file-writer";

export function generateProviderIndex(params: {
  providerDir: string;
  indexDir?: string;
  interceptorsDir: string;
  templatesDir: string;
  templatesOverride?: string;
  perFile?: {
    models?: string;
    types?: string;
    service?: string;
    index?: string;
    "interceptors-index"?: string;
  };
  corePathStr: string;
  services: Record<string, ServiceGroup>;
  indexProviderTypesPath?: string;
  indexClientPath?: string;
  indexHooksPath?: string;
  indexServiceDir?: string;
  servicesDir?: string;
  serviceFileNames?: Record<string, string>;
}): void {
  const {
    providerDir,
    indexDir,
    interceptorsDir,
    templatesDir,
    templatesOverride,
    perFile,
    corePathStr,
    services,
    indexProviderTypesPath,
    indexClientPath,
    indexHooksPath,
    indexServiceDir,
    serviceFileNames,
  } = params;

  const actualIndexDir = indexDir || providerDir;

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
    resolveTemplatePath(
      "interceptors-index.hbs",
      templatesOverride,
      templatesDir,
      perFile?.["interceptors-index"],
    ),
  );
  const interceptorsIndexContent = interceptorsIndexTemplate({
    interceptors: interceptorImports,
    hasAuthManager: fs.existsSync(
      path.join(interceptorsDir, "bearer-auth-manager.ts"),
    ),
  });

  const isEmptyExport = /^\s*export\s*\{\s*\}\s*;?\s*$/m.test(
    interceptorsIndexContent,
  );

  if (isEmptyExport) {
    if (fs.existsSync(interceptorsIndexPath)) {
      fs.unlinkSync(interceptorsIndexPath);
      console.log(`Removed interceptors/index.ts (empty template)`);
    }
  } else {
    if (!fs.existsSync(path.dirname(interceptorsIndexPath))) {
      fs.mkdirSync(path.dirname(interceptorsIndexPath), { recursive: true });
    }
    writeGenerated(interceptorsIndexPath, interceptorsIndexContent);
    console.log(`Generated interceptors/index.ts`);
  }

  // Auto-generate provider index.ts
  const indexPath = path.join(actualIndexDir, "index.ts");
  const indexCustomCode = extractCustomCode(indexPath);

  let relInterceptorsPath = path
    .relative(actualIndexDir, interceptorsDir)
    .replace(/\\/g, "/");
  if (!relInterceptorsPath.startsWith("."))
    relInterceptorsPath = "./" + relInterceptorsPath;

  const indexData = {
    hasHooks: fs.existsSync(path.join(providerDir, "hooks.ts")),
    corePath: corePathStr,
    interceptorsPath: relInterceptorsPath,
    indexProviderTypesPath: indexProviderTypesPath || "./types",
    indexClientPath: indexClientPath || "./client",
    indexHooksPath: indexHooksPath || "./hooks",
    indexServiceDir: indexServiceDir || "./services",
    tags: Object.keys(services).map((t) => ({
      tag: t.toLowerCase(),
      className: toClassName(t),
      serviceFile: serviceFileNames?.[t] || `${t.toLowerCase()}.service`,
    })),
    interceptors: interceptorImports,
    customCode: indexCustomCode,
  };

  const indexTemplate = compileTemplate(
    resolveTemplatePath(
      "index.hbs",
      templatesOverride,
      templatesDir,
      perFile?.index,
    ),
  );
  writeGenerated(indexPath, indexTemplate(indexData));
  console.log(`Generated provider index.ts`);
}
