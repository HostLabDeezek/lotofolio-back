/**
 * Idempotent admin seed script.
 *
 * Usage:
 *   ADMIN_PASSWORD=<secret> npm run seed:admin
 *
 * Behaviour:
 *   - If admin@lotofolio.fr does not exist → creates it with role ADMIN.
 *   - If it already exists as ADMIN        → no-op.
 *   - If it already exists as USER         → upgrades role to ADMIN.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { Role } from '../src/generated/prisma/enums.ts';
import bcrypt from 'bcrypt';

const ADMIN_EMAIL = 'admin@lotofolio.fr';
const ADMIN_USERNAME = 'Admin Lotofolio';
const ADMIN_FIRST_NAME = 'Admin';
const ADMIN_LAST_NAME = 'Lotofolio';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD environment variable is required');
  }

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        username: ADMIN_USERNAME,
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        password: hashed,
        role: Role.ADMIN,
      },
    });
    console.log(`✅ Admin user created (id=${admin.id})`);
  } else if (existing.role === Role.ADMIN) {
    console.log(`ℹ️  Admin user already exists (id=${existing.id}) — no changes.`);
  } else {
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: Role.ADMIN },
    });
    console.log(`⬆️  User ${existing.id} upgraded to ADMIN.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
