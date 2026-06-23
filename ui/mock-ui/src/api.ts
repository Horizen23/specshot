import type { TagGroup, EndpointConfig } from "./types";

// Fetch current configurations
export async function fetchConfig(): Promise<{
  specSource?: string;
  outputDir?: string;
}> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

// Save mock configuration
export async function saveConfig(
  endpoints: Record<string, EndpointConfig>,
): Promise<void> {
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoints }),
  });
  if (!res.ok) throw new Error("Failed to save config");
}

// Fetch status of mock server (running state + active port)
export async function fetchMockServerStatus(): Promise<{
  running: boolean;
  port: number;
}> {
  const res = await fetch("/api/mock-server");
  if (!res.ok) throw new Error("Failed to fetch mock server status");
  return res.json();
}

// Start or stop mock server
export async function toggleMockServer(
  action: "start" | "stop",
  port: number,
): Promise<{ running: boolean; port: number }> {
  const res = await fetch("/api/mock-server", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, port }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to ${action} mock server`);
  return data;
}

// Load specifications via specSource URL or path
export async function loadSpec(
  source: string,
): Promise<{ tags: TagGroup[]; totalEndpoints: number }> {
  const res = await fetch("/api/spec?source=" + encodeURIComponent(source));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load spec");
  return data;
}

// Generate MSW handlers files
export async function generateHandlers(payload: {
  specSource: string;
  outputDir: string;
  endpoints: Record<string, any>;
}): Promise<{ handlersGenerated: number }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate handlers");
  return data;
}

// Request backend Faker.js generator to regenerate seeds
export async function regenerateFaker(payload: {
  specSource: string;
  key: string;
  fakerArraySizes: Record<string, number>;
  fakerFormats: Record<string, string>;
}): Promise<{ mockExampleFaker: string }> {
  const res = await fetch("/api/regenerate-faker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.error)
    throw new Error(data.error || "Failed to regenerate faker data");
  return data;
}

// Send test API request
export async function sendTestRequest(
  method: string,
  url: string,
  body?: string,
): Promise<{ status: number; statusText: string; body: string }> {
  const opts: RequestInit = { method, headers: {} };
  if (body && method !== "GET" && method !== "HEAD") {
    (opts.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    opts.body = body;
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    body: text,
  };
}
