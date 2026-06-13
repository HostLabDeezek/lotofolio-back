import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import authService from '../services/auth.service.js';


const RegisterSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)'),
  username: z.string().min(2, "Nom d'utilisateur trop court").max(30, "Nom d'utilisateur trop long"),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
});

const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Nouveau mot de passe trop court (8 caractères minimum)'),
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

    const { email, password, username, firstName, lastName } = result.data;

    try {
      const { user, token } = await authService.createUser(email, password, username, firstName, lastName);
      res.status(201).json({ message: 'Utilisateur créé avec succès', user, token });
    } catch (error: any) {
      if (error.message === 'EMAIL_TAKEN') {
        return res.status(400).json({ code: 'EMAIL_TAKEN', message: 'Cet email est déjà utilisé' });
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

  async updatePassword(req: Request, res: Response, next: NextFunction) {
    const result = UpdatePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Données invalides',
        details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message })),
      });
    }

    const { currentPassword, newPassword } = result.data;

    try {
      await authService.updatePassword(req.userId!, currentPassword, newPassword);
      res.json({ message: 'Mot de passe mis à jour avec succès' });
    } catch (error: any) {
      if (error.message === 'INVALID_CURRENT_PASSWORD') {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      }
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
      next(error);
    }
  }
}

export default new AuthController();
