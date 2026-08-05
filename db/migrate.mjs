import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const connectAttempts = Math.max(1, Number.parseInt(process.env.DATABASE_CONNECT_ATTEMPTS || "10", 10) || 10);
const connectRetryMs = Math.max(250, Number.parseInt(process.env.DATABASE_CONNECT_RETRY_MS || "2000", 10) || 2000);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
const schema = await readFile(schemaPath, "utf8");
let client;

for (let attempt = 1; attempt <= connectAttempts; attempt += 1) {
  const candidate = new pg.Client({ connectionString: databaseUrl });
  try {
    await candidate.connect();
    client = candidate;
    break;
  } catch (error) {
    await candidate.end().catch(() => undefined);
    if (attempt === connectAttempts) throw error;
    const code = error && typeof error === "object" && "code" in error ? error.code : "connection_error";
    console.warn(`Database connection attempt ${attempt}/${connectAttempts} failed (${code}); retrying.`);
    await new Promise((resolve) => setTimeout(resolve, connectRetryMs));
  }
}

if (!client) throw new Error("Could not connect to the database");
try {
  await client.query(schema);
  console.log("Database schema is up to date.");
} finally {
  await client.end();
}
