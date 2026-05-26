/*
  Warnings:

  - You are about to drop the column `jeu_id` on the `grilles` table. All the data in the column will be lost.
  - You are about to drop the column `grille_id` on the `parties` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id,tirage_id]` on the table `parties` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `partie_id` to the `grilles` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "parties" DROP CONSTRAINT "parties_grille_id_fkey";

-- AlterTable
ALTER TABLE "grilles" DROP COLUMN "jeu_id",
ADD COLUMN     "partie_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "parties" DROP COLUMN "grille_id";

-- CreateIndex
CREATE UNIQUE INDEX "parties_user_id_tirage_id_key" ON "parties"("user_id", "tirage_id");

-- AddForeignKey
ALTER TABLE "grilles" ADD CONSTRAINT "grilles_partie_id_fkey" FOREIGN KEY ("partie_id") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
