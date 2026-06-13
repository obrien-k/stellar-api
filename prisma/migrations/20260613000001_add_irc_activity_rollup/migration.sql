-- CreateTable
CREATE TABLE "irc_activity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "msgCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "irc_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "irc_activity_userId_day_idx" ON "irc_activity"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "irc_activity_userId_channel_day_key" ON "irc_activity"("userId", "channel", "day");

-- AddForeignKey
ALTER TABLE "irc_activity" ADD CONSTRAINT "irc_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
