import { prisma } from "../lib/prisma.js";
import { Jeu } from "../../generated/prisma/client.js";

export class JeuService {

    /**
     * Récupérer tous les jeux disponibles
     * @returns {Promise<Jeu[]>} Une liste de jeux
     */
    async getAllJeux(): Promise<Jeu[]> {
        return await prisma.jeu.findMany();
    }
}

export default new JeuService();
