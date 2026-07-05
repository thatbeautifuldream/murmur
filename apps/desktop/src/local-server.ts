import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOCAL_HTTP_PORT } from "@app/contracts";
import { resolveRendererIndex } from "./app-window";
import { openApiSpec } from "./openapi";
import {
  clearTranscriptHistory,
  deleteTranscriptHistoryEntry,
  getTranscriptAudioFile,
  listTranscriptHistory,
} from "./transcript-history";

let server: Server | undefined;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

// Scalar API Reference loaded from CDN — a localhost-only dev doc viewer, so an
// external asset is acceptable; the spec itself is served locally at /openapi.json.
const SCALAR_API_REFERENCE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Murmur API</title>
    <style>
      html,
      body,
      #app {
        min-height: 100%;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/openapi.json',
        pageTitle: 'Murmur API',
        theme: 'saturn',
        layout: 'modern',
      });
    </script>
  </body>
</html>`;

/** Serves the built web renderer (the same bundle Electron loads over file://)
 *  so the full app is reachable in a plain browser at 127.0.0.1. Unknown paths
 *  fall back to index.html — the renderer routes client-side via hash history. */
function serveStatic(pathname: string, res: ServerResponse): void {
  const rendererDir = path.dirname(resolveRendererIndex());
  const relative = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rendererDir, relative);

  // Confine to the renderer dir; anything outside or missing serves index.html.
  if (!filePath.startsWith(rendererDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = resolveRendererIndex();
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function withCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Serves the web UI and lets a plain browser tab (no `window.desktopBridge`)
 *  read and manage the same transcript history as the Electron app, over
 *  localhost only. */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/openapi.json") {
    sendJson(res, 200, openApiSpec);
    return;
  }
  if (url.pathname === "/docs" || url.pathname === "/docs/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(SCALAR_API_REFERENCE_HTML);
    return;
  }

  if (segments[0] !== "transcript-history") {
    serveStatic(url.pathname, res);
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
