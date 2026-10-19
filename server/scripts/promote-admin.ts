import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
const connectionString = process.env.DATABASE_URL?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:promote -- user@example.com");
  process.exit(2);
}
if (!connectionString || connectionString.includes("CHANGE_ME")) {
  console.error("Set DATABASE_URL in server/.env before running this command.");
  process.exit(2);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, username: true, role: true } });
  if (!user) {
    console.error(`No account exists for ${email}. Register normally first, then run this command.`);
    process.exitCode = 1;
  } else {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN", accountStatus: "ACTIVE" }, select: { email: true, username: true, role: true } });
    console.log(`Administrator role granted to ${updated.email} (@${updated.username}). Password unchanged.`);
    await prisma.session.deleteMany({ where: { userId: user.id } });
    console.log("Existing sessions revoked; sign in again.");
  }
} finally { await prisma.$disconnect(); }
