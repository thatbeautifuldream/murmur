import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { LOCAL_HTTP_PORT } from "@app/contracts";
import {
  clearTranscriptHistory,
  deleteTranscriptHistoryEntry,
  getTranscriptAudioFile,
  listTranscriptHistory,
} from "./transcript-history";

let server: Server | undefined;

function withCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Lets a plain browser tab (no `window.desktopBridge`) read and manage the
 *  same transcript history as the Electron app, over localhost only. */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] !== "transcript-history") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (segments.length === 1 && req.method === "GET") {
    const limit = url.searchParams.get("limit");
    sendJson(res, 200, listTranscriptHistory(limit ? Number(limit) : undefined));
    return;
  }

  if (segments.length === 1 && req.method === "DELETE") {
    clearTranscriptHistory();
    res.writeHead(204);
    res.end();
    return;
  }

  if (segments.length === 3 && segments[2] === "audio" && req.method === "GET" && segments[1]) {
    const file = getTranscriptAudioFile(segments[1]);
    if (!file) {
      sendJson(res, 404, { error: "Audio not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": file.mimeType,
      "Content-Length": file.bytes.length,
    });
    res.end(file.bytes);
    return;
  }

  if (segments.length === 2 && req.method === "DELETE" && segments[1]) {
    deleteTranscriptHistoryEntry(segments[1]);
    res.writeHead(204);
    res.end();
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function startLocalServer(): void {
  if (server) return;
  server = createServer(handleRequest);
  server.listen(LOCAL_HTTP_PORT, "127.0.0.1");
}

export function stopLocalServer(): void {
  server?.close();
  server = undefined;
}
