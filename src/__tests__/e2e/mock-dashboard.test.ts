import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";
import { createTmpDir } from "./e2e-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, "../fixtures/petstore.json");

function startDashboard(
  port: number,
  file: string,
  cwd: string,
): Promise<{ process: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const cp = spawn(
      "node",
      [
        path.resolve(__dirname, "../../../dist/cli.js"),
        "mock",
        "--web",
        "--port",
        port.toString(),
        "--file",
        file,
      ],
      {
        cwd,
        env: { ...process.env, SPECSHOT_NO_BROWSER: "1" },
      },
    );

    const rl = readline.createInterface({ input: cp.stdout! });
    const timeout = setTimeout(() => {
      cp.kill("SIGKILL");
      reject(
        new Error(`Timeout waiting for dashboard to start on port ${port}`),
      );
    }, 8000);

    rl.on("line", (line) => {
      if (line.includes("SpecShot Mock Dashboard running at")) {
        clearTimeout(timeout);
        const urlMatch = line.match(/http:\/\/localhost:\d+/);
        const url = urlMatch ? urlMatch[0] : `http://localhost:${port}`;
        resolve({ process: cp, url });
      }
    });

    cp.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    cp.stderr.on("data", (data) => {
      // console.error("[Dashboard Stderr]", data.toString());
    });
  });
}

describe("F3 Dashboard API (mock --web command)", () => {
  let tmpDir: string;
  let sharedServer: ChildProcess | null = null;
  let sharedUrl: string = "";
  const sharedPort = 18000;

  beforeAll(async () => {
    tmpDir = createTmpDir("specshot-dashboard-test");
    // Start a shared server for API endpoints tests to speed up the suite
    const res = await startDashboard(sharedPort, fixturePath, tmpDir);
    sharedServer = res.process;
    sharedUrl = res.url;
  });

  afterAll(() => {
    if (sharedServer) {
      sharedServer.kill("SIGKILL");
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 1
  it("should start dashboard server and fallback to next available dashboard port", async () => {
    const mockApiPort = 18100;
    let serverProc: ChildProcess | null = null;
    try {
      const res = await startDashboard(mockApiPort, fixturePath, tmpDir);
      serverProc = res.process;
      expect(res.url).toMatch(/http:\/\/localhost:\d+/);
    } finally {
      if (serverProc) {
        serverProc.kill("SIGKILL");
      }
    }
  });

  // Test 2
  it("should start mock server on custom port specified by --port", async () => {
    const mockApiPort = 18101;
    let serverProc: ChildProcess | null = null;
    try {
      const res = await startDashboard(mockApiPort, fixturePath, tmpDir);
      serverProc = res.process;

      const configRes = await fetch(`${res.url}/api/mock-server`);
      expect(configRes.status).toBe(200);
      const data = (await configRes.json()) as any;
      expect(data.port).toBe(mockApiPort);
    } finally {
      if (serverProc) {
        serverProc.kill("SIGKILL");
      }
    }
  });

  // Test 3
  it("should handle dashboard port collision gracefully by attempting fallback port", async () => {
    const mockApiPort = 18200;
    let server1: ChildProcess | null = null;
    let server2: ChildProcess | null = null;
    try {
      const res1 = await startDashboard(mockApiPort, fixturePath, tmpDir);
      server1 = res1.process;

      // Start second server, its dashboard port will collide with server1's dashboard port
      server2 = spawn(
        "node",
        [
          path.resolve(__dirname, "../../../dist/cli.js"),
          "mock",
          "--web",
          "--port",
          (mockApiPort + 1).toString(),
          "--file",
          fixturePath,
        ],
        { cwd: tmpDir },
      );

      const stdoutText = await new Promise<string>((resolve) => {
        const rl = readline.createInterface({ input: server2!.stdout! });
        rl.on("line", (line) => {
          if (line.includes("is in use, trying")) {
            resolve(line);
          }
        });
      });

      expect(stdoutText).toMatch(/Port 345\d is in use, trying/);
    } finally {
      if (server1) server1.kill("SIGKILL");
      if (server2) server2.kill("SIGKILL");
    }
  }, 20000);

  // Test 4
  it("should fail to start dashboard server with invalid command flags", async () => {
    const cp = spawn(
      "node",
      [
        path.resolve(__dirname, "../../../dist/cli.js"),
        "mock",
        "--web",
        "--invalid-flag",
      ],
      { cwd: tmpDir },
    );

    const code = await new Promise<number | null>((resolve) => {
      cp.on("close", resolve);
    });

    expect(code).not.toBe(0);
  });

  // Test 5
  it("should handle GET /api/config and return default JSON config", async () => {
    const res = await fetch(`${sharedUrl}/api/config`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("mockServerPort");
    expect(data).toHaveProperty("mockServerRunning");
  });

  // Test 6
  it("should handle POST /api/config to save and update current mock configurations", async () => {
    const updatePayload = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          delay: 100,
        },
      },
    };

    const res = await fetch(`${sharedUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);

    // Verify config was updated
    const checkRes = await fetch(`${sharedUrl}/api/config`);
    const currentConfig = (await checkRes.json()) as any;
    expect(currentConfig.endpoints["pets-listPets"].delay).toBe(100);
  });

  // Test 7
  it("should handle GET /api/mock-server to query the mock server state", async () => {
    const res = await fetch(`${sharedUrl}/api/mock-server`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("running");
    expect(data).toHaveProperty("port");
  });

  // Test 8
  it("should handle POST /api/mock-server action start/stop commands", async () => {
    // Stop server first
    let res = await fetch(`${sharedUrl}/api/mock-server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    expect(res.status).toBe(200);
    let data = (await res.json()) as any;
    expect(data.running).toBe(false);

    // Start server
    res = await fetch(`${sharedUrl}/api/mock-server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", port: 18300 }),
    });
    expect(res.status).toBe(200);
    data = (await res.json()) as any;
    expect(data.running).toBe(true);
    expect(data.port).toBe(18300);

    // Clean up: stop it
    await fetch(`${sharedUrl}/api/mock-server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  });

  // Test 9
  it("should handle GET /api/spec to retrieve tags and pre-selected endpoint lists", async () => {
    const res = await fetch(
      `${sharedUrl}/api/spec?source=${encodeURIComponent(fixturePath)}`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("specSource");
    expect(data).toHaveProperty("tags");
    expect(data.totalEndpoints).toBeGreaterThan(0);
  });

  // Test 10
  it("should handle POST /api/preview and return status 501 (Not Implemented)", async () => {
    const res = await fetch(`${sharedUrl}/api/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(501);
  });

  // Test 11
  it("should handle POST /api/regenerate-faker to generate mock data structures dynamically", async () => {
    const payload = {
      specSource: fixturePath,
      key: "pets-listPets",
      fakerArraySizes: { root: 5 },
      fakerFormats: {},
    };

    const res = await fetch(`${sharedUrl}/api/regenerate-faker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty("mockExampleFaker");
  });

  // Test 12
  it("should return 404 for undefined dashboard API routes", async () => {
    const res = await fetch(`${sharedUrl}/api/undefined-route`);
    expect(res.status).toBe(404);
  });
});
