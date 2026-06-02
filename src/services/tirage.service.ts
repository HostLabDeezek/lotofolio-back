import { randomInt } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { Tirage, TirageStatus } from '../generated/prisma/client.js';
import logger from '../lib/logger.js';
import { AppError } from '../errors/AppError.js';

const CUTOFF_MARGIN_MINUTES = 6;

export class TirageService {

    /**
     * Calcule l'heure UTC exacte du prochain tirage (demain à 20h00 heure de Paris).
     *
     * Paris est UTC+1 en hiver et UTC+2 en été — l'offset change selon la date.
     * On utilise un "probe" à 20h00 UTC pour demander à Intl quelle heure Paris affiche
     * à ce moment précis, ce qui révèle l'offset réel sans hardcoder les règles DST.
     *
     * @returns Date UTC correspondant à demain 20h00 heure de Paris
     */
    getNextTirageUTC() {
        const now = new Date();

        // toLocaleDateString avec 'en-CA' garantit le format YYYY-MM-DD dans le fuseau de Paris,
        // indépendamment du fuseau du serveur (qui tourne souvent en UTC)
        const todayParisStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
        const [year, month, day] = todayParisStr.split('-').map(Number);

        // Point de sonde : demain à 20h00 UTC (base de calcul, pas encore l'heure finale)
        const probe = new Date(Date.UTC(year, month - 1, day + 1, 20, 0, 0));

        // Hiver (UTC+1) : probe à 20h UTC → Paris affiche 21h → offset = 1
        // Été   (UTC+2) : probe à 20h UTC → Paris affiche 22h → offset = 2
        const parisHourAtProbe = parseInt(
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Paris',
                hour: 'numeric',
                hour12: false,
            }).format(probe)
        );

        // 20h00 Paris = 20h00 UTC - offset → on recule le probe de l'offset
        const offsetHours = parisHourAtProbe - 20;
        return new Date(probe.getTime() - offsetHours * 3_600_000);
    }

    /**
     * Simule un tirage en générant un nombre défini de numéros aléatoires uniques
     * entre 1 et un maximum spécifié.
     *
     * @param count Le nombre de numéros à tirer
     * @param max Le numéro maximum possible (inclus)
     * @returns Un tableau de numéros tirés
     */
    drawRandomNumbers(count: number, max: number): number[] {
        // Génère une liste de numéros de 1 à max, puis mélange et prend les premiers 'count'
        const pool = Array.from({ length: max }, (_, i) => i + 1);
        for (let i = 0; i < count; i++) {
            const j = randomInt(i, max);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count).sort((a, b) => a - b);
    }

    async createTiragesForTomorrow() {
        const tomorrowTirageUTC = this.getNextTirageUTC();
        const jeux = await prisma.jeu.findMany();
        const startedAt = new Date();
        let created = 0, skipped = 0;

        for (const jeu of jeux) {
            const tirage = await prisma.tirage.upsert({
                where: {
                    jeuId_dateTirage: { jeuId: jeu.id, dateTirage: tomorrowTirageUTC },
                },
                create: { jeuId: jeu.id, dateTirage: tomorrowTirageUTC },
                update: {},
            });

            if (tirage.createdAt >= startedAt) created++;
            else skipped++;
        }

        return { created, skipped, total: jeux.length };
    }
    /**
     * Effectue les tirages en attente dont la date de tirage est passée.
     *
     * Pattern de verrou atomique :
     *  1. On liste les tirages PENDING dont la date est <= maintenant.
     *  2. Pour chacun, on tente un updateMany conditionnel (PENDING -> DRAWING)
     *     dans une transaction. Cet UPDATE prend un verrou de ligne au niveau
     *     Postgres : si un autre worker a déjà claim le même tirage, son status
     *     n'est plus PENDING et notre updateMany renvoie count: 0 -> on skip.
     *  3. Si on a bien claim (count: 1), on tire les numéros et on passe à DONE.
     *  4. Toute exception fait rollback de la transaction, donc le status
     *     repasse à PENDING et le prochain run pourra retenter.
     */
    async performPendingDraws() {
        const now = new Date();

        const pendingTirages = await prisma.tirage.findMany({
            where: {
                status: TirageStatus.PENDING,
                dateTirage: { lte: now },
            },
            include: { jeu: true },
        });

        const report = { drawn: 0, skipped: 0, errors: 0, total: pendingTirages.length };

        for (const tirage of pendingTirages) {
            try {
                const claimed = await prisma.$transaction(async (tx) => {
                    const claim = await tx.tirage.updateMany({
                        where: { id: tirage.id, status: TirageStatus.PENDING },
                        data: { status: TirageStatus.DRAWING },
                    });

                    if (claim.count === 0) return false;

                    const numerosTires = this.drawRandomNumbers(
                        tirage.jeu.nbNumerosATirer,
                        tirage.jeu.intervalNumero,
                    );
                    const numeroChanceTire = this.drawRandomNumbers(
                        tirage.jeu.nbNumeroChanceATirer,
                        tirage.jeu.intervalNumeroChance,
                    );

                    await tx.tirage.update({
                        where: { id: tirage.id },
                        data: {
                            numerosTires,
                            numeroChanceTire,
                            status: TirageStatus.DONE,
                        },
                    });

                    return true;
                });

                if (claimed) report.drawn++;
                else report.skipped++;
            } catch (err) {
                report.errors++;
                logger.error('[performPendingDraws] Échec du tirage', { tirageId: tirage.id, error: err });
            }
        }

        logger.info('[performPendingDraws] Terminé', report);
        return report;
    }

    async getCurrentTirageByJeuId(jeuId: number): Promise<Tirage | null> {
        const jeu = await prisma.jeu.findUnique({ where: { id: jeuId } });
        if (!jeu) {
            throw new AppError('JEU_NOT_FOUND', 404, `Jeu avec id ${jeuId} non trouvé`);
        }

        const cutoffDate = new Date(Date.now() + CUTOFF_MARGIN_MINUTES * 60 * 1000)
        const tirage = await prisma.tirage.findFirst({ where: { jeuId, status: TirageStatus.PENDING, dateTirage: { gt: cutoffDate } }, orderBy: { dateTirage: 'asc' } });
        return tirage;


    }

}
export default new TirageService();