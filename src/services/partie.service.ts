import { prisma } from '../lib/prisma.js';
import { AppError } from '../errors/AppError.js';
import { getCutoffDate } from '../utils/cutoff.js';
import { TirageStatus } from '../generated/prisma/client.js';
import type { Jeu } from '../generated/prisma/client.js';

type GrilleInput = {
  numeros: number[];
  numeroChance: number[];
};

export class PartieService {

  async jouer(userId: number, tirageId: number, grilles: GrilleInput[]): Promise<void> {

    const tirage = await prisma.tirage.findUnique({
      where: { id: tirageId },
      include: { jeu: true },
    });
    if (!tirage) {
      throw new AppError('TIRAGE_NOT_FOUND', 404, `Tirage ${tirageId} non trouvé`);
    }

    const cutoffDate = getCutoffDate();
    if (tirage.status !== TirageStatus.PENDING || tirage.dateTirage <= cutoffDate) {
      throw new AppError('CUTOFF_PASSED', 409, `Tirage ${tirageId} trop proche, jeu fermé`);
    }

    this.validateGrilles(grilles, tirage.jeu);

    await prisma.partie.upsert({
      where: { userId_tirageId: { userId, tirageId } },    // condition pour trouver l'enregistrement
      create: { // si la partie n'existe PAS
        userId,
        tirageId,
        grilles: {
          create: grilles.map(g => ({
            numeros: g.numeros,
            numeroChance: g.numeroChance
          }))
        },
      },
      update: { // si la partieoui  existe DÉJÀ
        grilles: {
          create: grilles.map(g => ({
            numeros: g.numeros,
            numeroChance: g.numeroChance
          }))
        },
      },
    });
  }

  /**
   * Valide chaque grille contre les règles du jeu, et l'unicité des grilles entre elles.
   * Lève INVALID_GRILLE (400) au premier problème rencontré.
   */
  private validateGrilles(grilles: GrilleInput[], jeu: Jeu): void {
    for (const grille of grilles) {
      // Bon nombre de numéros
      if (
        grille.numeros.length !== jeu.nbNumerosATirer ||
        grille.numeroChance.length !== jeu.nbNumeroChanceATirer
      ) {
        throw new AppError('INVALID_GRILLE', 400, 'Nombre de numéros invalide pour ce jeu');
      }

      // Numéros dans la plage autorisée
      const numeroHorsPlage = grille.numeros.some(n => n < 1 || n > jeu.intervalNumero);
      const chanceHorsPlage = grille.numeroChance.some(n => n < 1 || n > jeu.intervalNumeroChance);
      if (numeroHorsPlage || chanceHorsPlage) {
        throw new AppError('INVALID_GRILLE', 400, 'Numéro hors de la plage autorisée');
      }

      // Pas de répétition à l'intérieur d'une grille
      if (
        new Set(grille.numeros).size !== grille.numeros.length ||
        new Set(grille.numeroChance).size !== grille.numeroChance.length
      ) {
        throw new AppError('INVALID_GRILLE', 400, 'Numéro répété dans une grille');
      }
    }

    // Pas deux grilles identiques (numéros + numéros chance, indépendamment de l'ordre)
    const seen = new Set<string>();
    for (const grille of grilles) {
      const key = JSON.stringify([
        [...grille.numeros].sort((a, b) => a - b),
        [...grille.numeroChance].sort((a, b) => a - b),
      ]);
      if (seen.has(key)) {
        throw new AppError('INVALID_GRILLE', 400, 'Deux grilles identiques soumises');
      }
      seen.add(key);
    }
  }
}

export default new PartieService();