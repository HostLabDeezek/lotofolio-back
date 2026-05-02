import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from '../../generated/prisma/client.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const disconnect = async () => {
  await prisma.$disconnect();
};

process.on('beforeExit', disconnect);
process.on('SIGINT', disconnect);
process.on('SIGTERM', disconnect);

export { prisma }
