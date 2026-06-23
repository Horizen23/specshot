import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const spec = fs.readFileSync(
  path.join(__dirname, "../local-file/openapi.json"),
  "utf8",
);

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/openapi.json") {
    res.writeHead(200);
    res.end(spec);
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(8080, () => {
  console.log("Mock backend running at http://localhost:8080");
  console.log("OpenAPI spec: http://localhost:8080/openapi.json");
  console.log("\nRun specshot in another terminal:");
  console.log("  cd examples/remote-api && npx specshot generate\n");
});
