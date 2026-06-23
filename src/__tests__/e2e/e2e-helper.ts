import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, "../../../dist/cli.js");

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

export function runCli(
  args: string[],
  options: { cwd: string; stdinInputs?: string[] },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [cliPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (options.stdinInputs && options.stdinInputs.length > 0) {
      const inputs = [...options.stdinInputs];
      const writeNext = () => {
        if (inputs.length > 0) {
          const next = inputs.shift();
          child.stdin.write(next + "\n");
          setTimeout(writeNext, 250);
        } else {
          child.stdin.end();
        }
      };
      setTimeout(writeNext, 500);
    } else {
      child.stdin.end();
    }

    child.on("close", (code) => {
      resolve({
        code,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
      });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

export function createTmpDir(prefix: string): string {
  const tmp = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  );
  fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}
