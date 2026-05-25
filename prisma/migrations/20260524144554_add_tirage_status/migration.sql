-- CreateEnum
CREATE TYPE "TirageStatus" AS ENUM ('PENDING', 'DRAWING', 'DONE', 'EXPIRED');

-- AlterTable
ALTER TABLE "tirages" ADD COLUMN     "status" "TirageStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "tirages_status_date_tirage_idx" ON "tirages"("status", "date_tirage");
