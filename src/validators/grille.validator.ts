import { z } from 'zod';

const grilleSchema = z.object({
  tirageId: z.number().int().positive(),
  grilles: z.array(z.object({
    numeros: z.array(z.number().int().positive()),
    numeroChance: z.array(z.number().int().positive())
  })).min(1)
});

export { grilleSchema };