import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

/** Create the Prisma client only when a database URL is configured.
 * This lets the API boot and explain configuration problems instead of crashing. */
export function getPrisma(): PrismaClient {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString || connectionString.includes("YOUR_PASSWORD")) {
    throw new Error("DATABASE_URL is not configured. Copy server/.env.example to server/.env and set your PostgreSQL password.");
  }

  const adapter = new PrismaPg({ connectionString });
  client = new PrismaClient({ adapter });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
