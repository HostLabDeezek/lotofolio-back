import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import authService from '../services/auth.service.js';


const RegisterSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)'),
  username: z.string().min(2, "Nom d'utilisateur trop court").max(30, "Nom d'utilisateur trop long"),
});

const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

class AuthController {

  async register(req: Request, res: Response, next: NextFunction) {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Données invalides',
        details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message })),
      });
    }

    const { email, password, username } = result.data;

    try {
      const { user, token } = await authService.createUser(email, password, username);
      res.status(201).json({ message: 'Utilisateur créé avec succès', user, token });
    } catch (error: any) {
      if (error.message === 'EMAIL_TAKEN') {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }
      next(error); // délègue au middleware global
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Données invalides',
        details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message })),
      });
    }

    const { email, password } = result.data;

    try {
      const { user, token } = await authService.loginUser(email, password);
      res.json({ message: 'Connexion réussie', user, token });
    } catch (error: any) {
      if (error.message === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      }
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.getUserById(req.userId!);
      res.json(user);
    } catch (error: any) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      next(error);
    }
  }
}

export default new AuthController();