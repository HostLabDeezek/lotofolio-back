import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import bcrypt from 'bcrypt'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    await prisma.resultat.deleteMany()
    await prisma.partie.deleteMany()
    await prisma.tirage.deleteMany()
    await prisma.grille.deleteMany()
    await prisma.jeu.deleteMany()
    await prisma.user.deleteMany()

    const plainPassword = 'Password1!'

    const hashedPassword = await bcrypt.hash(plainPassword, 10)

    const user = await prisma.user.create({
        data: {
            username: 'Maxime Dupuis',
            firstName: 'Maxime',
            lastName: 'Dupuis',
            email: 'user@lotofolio.fr',
            password: hashedPassword,
        },
    })
    console.log('Created user:', user)

    const allUsers = await prisma.user.findMany({})
    console.log('All users:', JSON.stringify(allUsers, null, 2))

    const jeu = await prisma.jeu.create({
        data: {
            nom: 'Loto',
            description: 'Jeu de Loto français avec un tirage par jour.',
            regle: 'Choisissez 5 numéros et un numéro chance. Des tirages ont lieu plusieurs fois par semaine.',
            intervalNumero: 50,
            nbNumerosATirer: 5,
            intervalNumeroChance: 10,
            nbNumeroChanceATirer: 1,
        },
    })
    console.log('Created game:', jeu)

    const jeu2 = await prisma.jeu.create({
        data: {
            nom: 'Loto Flash',
            description: 'Jeu express : 2 numéros parmi 20',
            regle: 'Choisissez 2 numéros entre 1 et 20, et un numéro chance entre 1 et 5.',
            intervalNumero: 20,
            nbNumerosATirer: 2,
            intervalNumeroChance: 5,
            nbNumeroChanceATirer: 1,
        },
    })
    console.log('Created game:', jeu2)

    const tirage = await prisma.tirage.create({
        data: {
            dateTirage: new Date('2026-02-05T20:00:00Z'),
            jeu: {
                connect: { id: jeu.id },
            },
        },
    })
    console.log('Created tirage:', tirage)
}

main()
    .then(async () => {
        await prisma.$disconnect()
        await pool.end()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        await pool.end()
        process.exit(1)
    })
