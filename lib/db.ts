import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var petCemeteryPool: Pool | undefined;
}

const connectionAttempts = Math.max(1, Number.parseInt(process.env.DATABASE_CONNECT_ATTEMPTS || "10", 10) || 10);
const connectionRetryMs = Math.max(250, Number.parseInt(process.env.DATABASE_CONNECT_RETRY_MS || "2000", 10) || 2000);

function isDnsRetryable(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
  return code === "EAI_AGAIN" || code === "ENOTFOUND";
}

async function withDnsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= connectionAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDnsRetryable(error) || attempt === connectionAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, connectionRetryMs));
    }
  }
  throw new Error("Database connection retry exhausted");
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool() {
  if (!global.petCemeteryPool) {
    global.petCemeteryPool = createPool();
  }
  return global.petCemeteryPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return withDnsRetry(() => getPool().query<T>(text, values));
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await withDnsRetry(() => getPool().connect());
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
