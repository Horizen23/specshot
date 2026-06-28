import http from "http";
import crypto from "crypto";
import type { Duplex } from "stream";
import { loadMockConfig } from "../types/mock-config";

const WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface WsClient {
  socket: Duplex;
  path: string;
}

const clientsByPath = new Map<string, Set<WsClient>>();

let mockServer: http.Server | null = null;

export function setMockServer(server: http.Server): void {
  mockServer = server;
}

function computeAcceptKey(key: string): string {
  return crypto
    .createHash("sha1")
    .update(key + WS_MAGIC_GUID)
    .digest("base64");
}

function parseHandshake(
  req: http.IncomingMessage,
): { key: string } | undefined {
  if (req.method !== "GET") return undefined;
  const upgrade = req.headers["upgrade"];
  if (!upgrade || upgrade.toLowerCase() !== "websocket") return undefined;
  const wsKey = req.headers["sec-websocket-key"];
  if (!wsKey || typeof wsKey !== "string") return undefined;
  return { key: wsKey };
}

export function handleUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const parsed = parseHandshake(req);
  if (!parsed) {
    socket.destroy();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const requestPath = url.pathname;

  const config = loadMockConfig();
  const wsEndpoints = config.webSocketEndpoints || {};

  const matched = Object.values(wsEndpoints).find(
    (ep) => ep.enabled && ep.path === requestPath,
  );
  if (!matched) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const acceptKey = computeAcceptKey(parsed.key);

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`,
  );

  const client: WsClient = { socket, path: requestPath };

  let clients = clientsByPath.get(requestPath);
  if (!clients) {
    clients = new Set();
    clientsByPath.set(requestPath, clients);
  }
  clients.add(client);

  console.log(
    `[MockServer] WebSocket connected on ${requestPath} (${clients.size} total)`,
  );

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];

      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLength = second & 0x7f;

      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) return;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return;
        const len = buffer.readBigUInt64BE(2);
        if (len > BigInt(Number.MAX_SAFE_INTEGER)) {
          socket.destroy();
          return;
        }
        payloadLength = Number(len);
        offset = 10;
      }

      const maskKey = masked ? 4 : 0;
      const totalFrameLen = offset + maskKey + payloadLength;

      if (buffer.length < totalFrameLen) return;

      let payload: Buffer;
      if (masked) {
        const key = buffer.slice(offset, offset + 4);
        payload = buffer.slice(offset + 4, offset + 4 + payloadLength);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= key[i % 4];
        }
      } else {
        payload = buffer.slice(offset, offset + payloadLength);
      }

      buffer = buffer.slice(totalFrameLen);

      if (opcode === 0x8) {
        handleClose(socket, client, requestPath);
        return;
      }

      if (opcode === 0x9) {
        sendFrame(socket, 0xa, Buffer.alloc(0));
        continue;
      }

      if (opcode === 0x1) {
        const message = payload.toString("utf8");
        console.log(
          `[MockServer] WebSocket message on ${requestPath}: ${message.substring(0, 200)}`,
        );
      }
    }
  });

  socket.on("close", () => {
    removeClient(client, requestPath);
  });

  socket.on("error", () => {
    removeClient(client, requestPath);
  });
}

function handleClose(socket: Duplex, client: WsClient, path: string): void {
  sendFrame(socket, 0x8, Buffer.alloc(0));
  removeClient(client, path);
  socket.destroy();
}

function removeClient(client: WsClient, path: string): void {
  const clients = clientsByPath.get(path);
  if (clients) {
    clients.delete(client);
    if (clients.size === 0) {
      clientsByPath.delete(path);
    }
  }
}

export function broadcast(
  path: string,
  message: string,
): { sent: number; error?: string } {
  const clients = clientsByPath.get(path);
  if (!clients || clients.size === 0) {
    return { sent: 0, error: `No clients connected to ${path}` };
  }

  const payload = Buffer.from(message, "utf8");
  const frame = buildTextFrame(payload);

  let count = 0;
  for (const client of clients) {
    try {
      client.socket.write(frame);
      count++;
    } catch {
      removeClient(client, path);
    }
  }

  return { sent: count };
}

export function getConnectionCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [path, clients] of clientsByPath) {
    counts[path] = clients.size;
  }
  return counts;
}

function buildFrame(opcode: number, payload: Buffer): Buffer {
  const first = Buffer.from([0x80 | opcode]);
  let lenBuf: Buffer;

  if (payload.length < 126) {
    lenBuf = Buffer.from([payload.length]);
  } else if (payload.length <= 0xffff) {
    lenBuf = Buffer.alloc(3);
    lenBuf[0] = 126;
    lenBuf.writeUInt16BE(payload.length, 1);
  } else {
    lenBuf = Buffer.alloc(9);
    lenBuf[0] = 127;
    lenBuf.writeBigUInt64BE(BigInt(payload.length), 1);
  }

  return Buffer.concat([first, lenBuf, payload]);
}

function buildTextFrame(payload: Buffer): Buffer {
  return buildFrame(0x1, payload);
}

function sendFrame(socket: Duplex, opcode: number, payload: Buffer): void {
  socket.write(buildFrame(opcode, payload));
}
