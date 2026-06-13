-- AlterTable
ALTER TABLE "users" DROP COLUMN "communityPass",
ADD COLUMN     "announceKey" TEXT,
ADD COLUMN     "ircKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_ircKey_key" ON "users"("ircKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_announceKey_key" ON "users"("announceKey");
