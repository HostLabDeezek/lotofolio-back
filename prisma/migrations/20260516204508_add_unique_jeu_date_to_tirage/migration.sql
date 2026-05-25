/*
  Warnings:

  - A unique constraint covering the columns `[jeu_id,date_tirage]` on the table `tirages` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "tirages_jeu_id_date_tirage_key" ON "tirages"("jeu_id", "date_tirage");
