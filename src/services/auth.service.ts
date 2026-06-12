import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { Role } from '../../generated/prisma/enums.js';

export class AuthService {

  async createUser(email: string, password: string, username: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('EMAIL_TAKEN');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, username },
      select: { id: true, email: true, username: true, role: true },
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role as Role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    return { user, token };
  }

  async loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role as Role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    return {
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      token,
    };
  }

  async getUserById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, createdAt: true, updatedAt: true },
    });
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    return user;
  }
}

export default new AuthService();