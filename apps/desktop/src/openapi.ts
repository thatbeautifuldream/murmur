import { app } from "electron";
import { LOCAL_HTTP_PORT } from "@app/contracts";

const SPEECHD_URL = "http://127.0.0.1:8722";

/** OpenAPI 3 spec for both localhost HTTP surfaces: the Electron local server
 *  (transcript history, this port) and the Swift murmur-speechd daemon. Served
 *  as /openapi.json with Scalar API Reference at /docs. speechd paths carry a path-level
 *  `servers` override since they live on a different port. */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Murmur local API",
    version: app.getVersion(),
    description:
      "Localhost-only HTTP APIs exposed by the Murmur desktop app. The transcript-history endpoints are served by the Electron process; the dictation endpoints are served by the native murmur-speechd daemon on port 8722.",
  },
  servers: [{ url: `http://127.0.0.1:${LOCAL_HTTP_PORT}`, description: "Electron local server" }],
  tags: [
    { name: "Transcript History", description: "Read and manage saved transcripts (Electron)." },
    { name: "Dictation", description: "Speech recognition daemon (murmur-speechd, port 8722)." },
  ],
  paths: {
    "/transcript-history": {
      get: {
        tags: ["Transcript History"],
        summary: "List transcripts",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1 },
            description: "Maximum number of entries, newest first.",
          },
        ],
        responses: {
          "200": {
            description: "Transcript entries, newest first.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TranscriptHistoryEntry" },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Transcript History"],
        summary: "Clear all transcripts",
        responses: { "204": { description: "History cleared." } },
      },
    },
    "/transcript-history/{id}": {
      delete: {
        tags: ["Transcript History"],
        summary: "Delete one transcript",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "204": { description: "Entry deleted (or already absent)." } },
      },
    },
    "/transcript-history/{id}/audio": {
      get: {
        tags: ["Transcript History"],
        summary: "Fetch transcript audio",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Raw audio bytes for the transcript.",
            content: { "audio/*": { schema: { type: "string", format: "binary" } } },
          },
          "404": {
            description: "No audio for this transcript.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Dictation"],
        summary: "Daemon health check",
        servers: [{ url: SPEECHD_URL }],
        responses: {
          "200": {
            description: "Daemon is up.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { status: { type: "string", example: "ok" } } },
              },
            },
          },
        },
      },
    },
    "/start": {
      post: {
        tags: ["Dictation"],
        summary: "Start listening",
        servers: [{ url: SPEECHD_URL }],
        parameters: [
          {
            name: "locale",
            in: "query",
            required: false,
            schema: { type: "string", default: "en-US" },
          },
          {
            name: "recordingPath",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Absolute path to write the recorded audio to.",
          },
        ],
        responses: {
          "200": {
            description: "Now listening.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { status: { type: "string", example: "listening" } } },
              },
            },
          },
          "500": {
            description: "Failed to start (e.g. permission denied).",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/partial": {
      get: {
        tags: ["Dictation"],
        summary: "Latest partial transcript",
        servers: [{ url: SPEECHD_URL }],
        responses: {
          "200": {
            description: "Best-effort partial text since the last start.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { text: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    "/stop": {
      post: {
        tags: ["Dictation"],
        summary: "Stop and return final transcript",
        servers: [{ url: SPEECHD_URL }],
        responses: {
          "200": {
            description: "Final transcript and audio path.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    audioPath: { type: "string", description: "Empty string when no recording was written." },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      TranscriptHistoryEntry: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          locale: { type: "string" },
          sourceAppName: { type: "string", nullable: true },
          sourceAppBundleId: { type: "string", nullable: true },
          sourceProcessId: { type: "integer", nullable: true },
          durationMs: { type: "integer", nullable: true },
          audioPath: { type: "string", nullable: true },
          audioFormat: { type: "string", nullable: true },
          audioByteSize: { type: "integer", nullable: true },
          inserted: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "text", "locale", "inserted", "createdAt"],
      },
    },
  },
} as const;
