import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string(),
  CUTOFF_MARGIN_MINUTES: z.coerce.number().int().positive().default(6),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Variables d\'environnement invalides :');
  result.error.issues.forEach(issue => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = result.data;
