import { prisma } from '../lib/prisma.js';
import { AppError } from '../errors/AppError.js';
import { getCutoffDate } from '../utils/cutoff.js';
import { TirageStatus } from '../generated/prisma/client.js';
import type { Jeu } from '../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';

/** Maximum number of grilles a regular USER may have on a single tirage. */
const MAX_GRILLES_PER_TIRAGE_USER = 10;

type GrilleInput = {
  numeros: number[];
  numeroChance: number[];
};

export type PartieHistoriqueItem = {
  partieId: number;
  tirageId: number;
  /** Date du tirage (ISO 8601) — correspond à `Tirage.dateTirage`. */
  dateTirage: string;
  jeu: { id: number; nom: string };
  /** Status du tirage — permet au frontend de séparer "en cours" et "réalisés". */
  status: TirageStatus;
};

export type PartieDetailResponse = {
  partieId: number;
  tirage: {
    id: number;
    dateTirage: string;
    /** Status du tirage — détermine l'affichage du détail (en cours vs réalisé). */
    status: TirageStatus;
    numerosTires: number[];
    numeroChanceTire: number[];
    jeu: { id: number; nom: string };
  };
  grilles: Array<{ numeros: number[]; numeroChance: number[] }>;
};

export class PartieService {

  async jouer(userId: number, tirageId: number, grilles: GrilleInput[], userRole: Role): Promise<void> {

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

    // Grille limit check + upsert in a single transaction to prevent TOCTOU races.
    // Note: READ COMMITTED isolation means two truly simultaneous requests could still
    // both pass the check if they interleave perfectly — for strict enforcement a
    // SELECT FOR UPDATE or DB-level counter would be needed. This is sufficient for
    // the expected load pattern.
    await prisma.$transaction(async (tx) => {
      if (userRole !== Role.ADMIN) {
        const existing = await tx.partie.findUnique({
          where: { userId_tirageId: { userId, tirageId } },
          include: { grilles: { select: { id: true } } },
        });
        const existingCount = existing?.grilles.length ?? 0;
        if (existingCount + grilles.length > MAX_GRILLES_PER_TIRAGE_USER) {
          throw new AppError(
            'GRILLE_LIMIT_REACHED',
            409,
            `Maximum ${MAX_GRILLES_PER_TIRAGE_USER} grilles par tirage autorisées (vous en avez déjà ${existingCount})`,
          );
        }
      }

      await tx.partie.upsert({
        where: { userId_tirageId: { userId, tirageId } },
        create: {
          userId,
          tirageId,
          grilles: {
            create: grilles.map(g => ({
              numeros: g.numeros,
              numeroChance: g.numeroChance
            }))
          },
        },
        update: {
          grilles: {
            create: grilles.map(g => ({
              numeros: g.numeros,
              numeroChance: g.numeroChance
            }))
          },
        },
      });
    });
  }

  /**
   * Retourne l'historique des parties de l'utilisateur, triées par date de tirage décroissante.
   * Retourne dateTirage (même nom que Tirage.dateTirage) pour cohérence avec l'endpoint détail (LF-39).
   */
  async getHistory(userId: number): Promise<PartieHistoriqueItem[]> {
    const parties = await prisma.partie.findMany({
      where: { userId },
      include: {
        tirage: {
          include: { jeu: true },
        },
      },
      orderBy: { tirage: { dateTirage: 'desc' } },
    });

    return parties.map(p => ({
      partieId: p.id,
      tirageId: p.tirageId,
      dateTirage: p.tirage.dateTirage.toISOString(),
      jeu: { id: p.tirage.jeu.id, nom: p.tirage.jeu.nom },
      status: p.tirage.status,
    }));
  }

  /**
   * Retourne le détail d'une partie (tirage + grilles).
   * Lève PARTIE_NOT_FOUND (404) si la partie n'existe pas ou n'appartient pas à l'utilisateur.
   */
  async getPartieDetail(userId: number, partieId: number): Promise<PartieDetailResponse> {
    const partie = await prisma.partie.findFirst({
      where: { id: partieId, userId },
      include: {
        tirage: { include: { jeu: true } },
        grilles: true,
      },
    });

    if (!partie) {
      throw new AppError('PARTIE_NOT_FOUND', 404, `Partie ${partieId} introuvable`);
    }

    return {
      partieId: partie.id,
      tirage: {
        id: partie.tirage.id,
        dateTirage: partie.tirage.dateTirage.toISOString(),
        status: partie.tirage.status,
        numerosTires: partie.tirage.numerosTires,
        numeroChanceTire: partie.tirage.numeroChanceTire,
        jeu: { id: partie.tirage.jeu.id, nom: partie.tirage.jeu.nom },
      },
      grilles: partie.grilles.map(g => ({
        numeros: g.numeros,
        numeroChance: g.numeroChance,
      })),
    };
  }

  /**
   * Valide chaque grille contre les règles du jeu, et l'unicité des grilles entre elles.
   * Lève INVALID_GRILLE (400) au premier problème rencontré.
   */
  private validateGrilles(grilles: GrilleInput[], jeu: Jeu): void {
    for (const grille of grilles) {
      if (
        grille.numeros.length !== jeu.nbNumerosATirer ||
        grille.numeroChance.length !== jeu.nbNumeroChanceATirer
      ) {
        throw new AppError('INVALID_GRILLE', 400, 'Nombre de numéros invalide pour ce jeu');
      }

      const numeroHorsPlage = grille.numeros.some(n => n < 1 || n > jeu.intervalNumero);
      const chanceHorsPlage = grille.numeroChance.some(n => n < 1 || n > jeu.intervalNumeroChance);
      if (numeroHorsPlage || chanceHorsPlage) {
        throw new AppError('INVALID_GRILLE', 400, 'Numéro hors de la plage autorisée');
      }

      if (
        new Set(grille.numeros).size !== grille.numeros.length ||
        new Set(grille.numeroChance).size !== grille.numeroChance.length
      ) {
        throw new AppError('INVALID_GRILLE', 400, 'Numéro répété dans une grille');
      }
    }

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
