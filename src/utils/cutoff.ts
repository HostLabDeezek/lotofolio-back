import { env } from '../config/env.js';

/**
 * Date limite de jeu : on refuse de jouer un tirage dont la date est à moins de
 * CUTOFF_MARGIN_MINUTES de maintenant. Un tirage est encore jouable tant que
 * sa dateTirage est strictement après la date retournée.
 */
export function getCutoffDate(): Date {
  return new Date(Date.now() + env.CUTOFF_MARGIN_MINUTES * 60 * 1000);
}
