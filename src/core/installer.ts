import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplatesBaseDir(): string {
  let dir = path.join(__dirname, "../../templates");
  if (!fs.existsSync(dir) || !fs.existsSync(path.join(dir, "core"))) {
    dir = path.join(__dirname, "../templates");
  }
  return dir;
}

function compileAndWrite(
  sourceDir: string,
  targetDir: string,
  data: Record<string, unknown>,
  filter?: (file: string) => boolean,
): void {
  const walk = (src: string, dest: string) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, destPath);
      } else if (entry.name.endsWith(".hbs")) {
        if (filter && !filter(srcPath)) continue;
        const templateStr = fs.readFileSync(srcPath, "utf8");
        const template = Handlebars.compile(templateStr);
        const result = template(data);
        fs.writeFileSync(destPath.replace(/\.hbs$/, ".ts"), result);
      }
    }
  };
  walk(sourceDir, targetDir);
}

export interface InstallCoreOptions {
  coreDir: string;
}

export function installCore(options: InstallCoreOptions): boolean {
  const { coreDir } = options;
  const targetCoreDir = path.resolve(process.cwd(), coreDir);

  const coreTypesPath = path.join(targetCoreDir, "types.ts");
  if (fs.existsSync(coreTypesPath)) return false;

  const templatesBaseDir = getTemplatesBaseDir();
  const templateCoreDir = path.join(templatesBaseDir, "core");

  if (!fs.existsSync(targetCoreDir))
    fs.mkdirSync(targetCoreDir, { recursive: true });

  compileAndWrite(templateCoreDir, targetCoreDir, {
    corePath: ".",
    serverUrl: "",
  });

  return true;
}

export interface InstallProviderOptions {
  providerDir: string;
  coreDir: string;
  integration: string;
  interceptors: string[];
  openapiUrl?: string;
}

export function installProvider(options: InstallProviderOptions): boolean {
  const { providerDir, coreDir, integration, interceptors, openapiUrl } =
    options;
  const targetProviderDir = path.resolve(process.cwd(), providerDir);
  const targetCoreDir = path.resolve(process.cwd(), coreDir);

  const clientPath = path.join(targetProviderDir, "client.ts");
  if (fs.existsSync(clientPath)) return false;

  const templatesBaseDir = getTemplatesBaseDir();
  const templateProviderDir = path.join(templatesBaseDir, "provider");
  const templateSWRDir = path.join(templatesBaseDir, "integrations/swr");
  const templateReactQueryDir = path.join(
    templatesBaseDir,
    "integrations/react-query",
  );

  if (!fs.existsSync(targetProviderDir))
    fs.mkdirSync(targetProviderDir, { recursive: true });

  let coreRelativePath = path
    .relative(targetProviderDir, targetCoreDir)
    .replace(/\\/g, "/");
  if (!coreRelativePath.startsWith(".")) coreRelativePath = "./" + coreRelativePath;

  let serverUrl = "";
  if (openapiUrl) {
    try {
      const parsedUrl = new URL(openapiUrl);
      serverUrl = parsedUrl.origin;
    } catch {}
  }

  const templateData = { corePath: coreRelativePath, serverUrl };

  const interceptorMap: Record<string, string> = {
    "bearer-auth-manager": "bearer",
    bearer: "bearer",
    logger: "logger",
  };

  compileAndWrite(
    templateProviderDir,
    targetProviderDir,
    templateData,
    (file: string) => {
      if (file.includes("/interceptors/")) {
        const base = path.basename(file, ".hbs");
        const required = interceptorMap[base];
        if (required && !interceptors.includes(required)) return false;
      }
      return true;
    },
  );

  if (integration === "swr")
    compileAndWrite(templateSWRDir, targetProviderDir, templateData);
  if (integration === "react-query")
    compileAndWrite(templateReactQueryDir, targetProviderDir, templateData);

  if (integration === "swr" || integration === "react-query") {
    const sharedHbs = path.join(
      templatesBaseDir,
      "integrations",
      "hooks-shared.hbs",
    );
    if (fs.existsSync(sharedHbs)) {
      const templateStr = fs.readFileSync(sharedHbs, "utf8");
      const compiled = Handlebars.compile(templateStr);
      fs.writeFileSync(
        path.join(targetProviderDir, "hooks-shared.ts"),
        compiled(templateData),
      );
    }
  }

  return true;
}
