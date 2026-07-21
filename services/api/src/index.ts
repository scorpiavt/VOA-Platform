import fs from "fs";
import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { initDb } from "./db";
import { registerRoutes } from "./routes";
import { ensureLauncherUpdateDefaults } from "./launcherUpdate";
import { assertNoNexusPersonalApiKey } from "./nexus";

async function main() {
  // Nexus §1 — refuse to start if any personal API key is configured
  assertNoNexusPersonalApiKey();
  initDb();
  ensureLauncherUpdateDefaults();

  fs.mkdirSync(config.dataDir, { recursive: true });
  const logPath = path.join(config.dataDir, "api-runtime.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const app = Fastify({
    logger: {
      level: "info",
      stream: logStream,
    },
    trustProxy: true,
  });

  // Allow empty JSON bodies on POST (sessions, etc.)
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const text = body === "" || body === undefined ? "{}" : String(body);
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

  await registerRoutes(app);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `VOA API listening on ${config.host}:${config.port} (public ${config.publicUrl})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
