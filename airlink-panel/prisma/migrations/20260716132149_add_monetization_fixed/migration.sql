-- CreateTable
CREATE TABLE "Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OFFER',
    "provider" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 0,
    "cooldown" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "description" TEXT,
    "conditions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "startsAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OfferReward" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "offerId" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    CONSTRAINT "OfferReward_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EarnSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "offerId" INTEGER,
    "token" TEXT NOT NULL,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "fingerprint" TEXT,
    "metadata" JSONB NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EarnSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EarnSession_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AfkSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AfkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserStreak" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastClaimDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonetizationFraudLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ipAddress" TEXT,
    "fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FLAGGED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonetizationFraudLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderHealthRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "responseTime" INTEGER NOT NULL,
    "lastSuccess" DATETIME,
    "lastFailure" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MonetizationSchedulerJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "nextRun" DATETIME,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "backoff" INTEGER NOT NULL DEFAULT 300,
    "timeout" INTEGER NOT NULL DEFAULT 60,
    "lastError" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserEarnPreferences" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "afkNotifications" BOOLEAN NOT NULL DEFAULT true,
    "rewardNotifications" BOOLEAN NOT NULL DEFAULT true,
    "streakNotifications" BOOLEAN NOT NULL DEFAULT true,
    "offerNotifications" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserEarnPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OfferReward_offerId_idx" ON "OfferReward"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "EarnSession_token_key" ON "EarnSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "EarnSession_nonce_key" ON "EarnSession"("nonce");

-- CreateIndex
CREATE INDEX "EarnSession_userId_type_idx" ON "EarnSession"("userId", "type");

-- CreateIndex
CREATE INDEX "EarnSession_token_idx" ON "EarnSession"("token");

-- CreateIndex
CREATE INDEX "EarnSession_createdAt_idx" ON "EarnSession"("createdAt");

-- CreateIndex
CREATE INDEX "AfkSession_userId_status_idx" ON "AfkSession"("userId", "status");

-- CreateIndex
CREATE INDEX "AfkSession_createdAt_idx" ON "AfkSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserStreak_userId_key" ON "UserStreak"("userId");

-- CreateIndex
CREATE INDEX "MonetizationFraudLog_userId_idx" ON "MonetizationFraudLog"("userId");

-- CreateIndex
CREATE INDEX "MonetizationFraudLog_createdAt_idx" ON "MonetizationFraudLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProviderHealthRecord_provider_createdAt_idx" ON "ProviderHealthRecord"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizationSchedulerJob_name_key" ON "MonetizationSchedulerJob"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserEarnPreferences_userId_key" ON "UserEarnPreferences"("userId");
