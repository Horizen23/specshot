const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const tmpDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "specshot-scaffolding-test-"),
);
const cliPath = path.resolve("dist/cli.js");
console.log("Running init in", tmpDir);
const res = spawnSync("node", [cliPath, "init"], {
  cwd: tmpDir,
  input: "\n\n\n\n\n",
});
console.log("STDOUT:", res.stdout.toString());
console.log("STDERR:", res.stderr.toString());
console.log("Files:", fs.readdirSync(tmpDir));
