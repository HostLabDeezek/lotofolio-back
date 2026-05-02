-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jeux" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "regle" TEXT,
    "nb_numeros" INTEGER NOT NULL,
    "interval_numeros" INTEGER NOT NULL,
    "nb_numero_chance_a_tirer" INTEGER NOT NULL,
    "interval_numero_chance" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jeux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grilles" (
    "id" SERIAL NOT NULL,
    "jeu_id" INTEGER NOT NULL,
    "numeros" INTEGER[],
    "numero_chance" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grilles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tirages" (
    "id" SERIAL NOT NULL,
    "jeu_id" INTEGER NOT NULL,
    "date_tirage" TIMESTAMP(3) NOT NULL,
    "numeros_tires" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "numero_chance_tire" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tirages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "grille_id" INTEGER NOT NULL,
    "tirage_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultats" (
    "id" SERIAL NOT NULL,
    "partie_id" INTEGER NOT NULL,
    "nb_bons_numeros" INTEGER NOT NULL,
    "nb_bons_chance" INTEGER NOT NULL,
    "rang" INTEGER,
    "gain" INTEGER NOT NULL,
    "is_gagnant" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "resultats_partie_id_key" ON "resultats"("partie_id");

-- AddForeignKey
ALTER TABLE "tirages" ADD CONSTRAINT "tirages_jeu_id_fkey" FOREIGN KEY ("jeu_id") REFERENCES "jeux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_grille_id_fkey" FOREIGN KEY ("grille_id") REFERENCES "grilles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tirage_id_fkey" FOREIGN KEY ("tirage_id") REFERENCES "tirages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultats" ADD CONSTRAINT "resultats_partie_id_fkey" FOREIGN KEY ("partie_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
