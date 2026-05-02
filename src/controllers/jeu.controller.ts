import { Request, Response, NextFunction } from "express";
import jeuService from "../services/jeu.service.js";


class JeuController {

    /**
     * Get api/jeux
     */

    async getAllJeux(req: Request, res: Response, next: NextFunction) {
        try {
            const jeux = await jeuService.getAllJeux();
            res.json(jeux);
        } catch (error) {
            next(error);
        }

    }
}

export default new JeuController();