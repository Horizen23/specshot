import fs from "fs";
import path from "path";

export interface MockEndpointEntry {
  enabled: boolean;
  tag: string;
  operationId: string;
  method: string;
  path: string;
  statusCode?: number;
  delay?: number;
  mockData?: string;
  errorEnabled?: boolean;
  errorStatus?: number;
  errorBody?: string;
}

export interface MockConfigFile {
  endpoints: Record<string, MockEndpointEntry>;
  outputDir?: string;
  specSource?: string;
  lastGenerated?: string;
  proxyTarget?: string;
  proxyEnabled?: boolean;
}

export const MOCK_CONFIG_FILE = "specshot.mocks.json";

export function loadMockConfig(cwd: string = process.cwd()): MockConfigFile {
  const configPath = path.resolve(cwd, MOCK_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return { endpoints: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return { endpoints: {} };
  }
}

export function saveMockConfig(
  config: MockConfigFile,
  cwd: string = process.cwd(),
): void {
  const configPath = path.resolve(cwd, MOCK_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function endpointKey(tag: string, operationId: string): string {
  return `${tag}-${operationId}`;
}
