-- CreateTable
CREATE TABLE "SharedChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedChat_userId_idx" ON "SharedChat"("userId");

-- CreateIndex
CREATE INDEX "SharedChat_sessionId_idx" ON "SharedChat"("sessionId");
