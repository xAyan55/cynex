-- Plugin Manager tables
CREATE TABLE IF NOT EXISTS "PluginManagerCache" (
    "cacheKey" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "PluginManagerInstallation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT,
    "versionId" TEXT,
    "versionNumber" TEXT,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER,
    "author" TEXT,
    "status" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_pm_install_server" ON "PluginManagerInstallation"("serverId");
CREATE INDEX IF NOT EXISTS "idx_pm_install_project" ON "PluginManagerInstallation"("serverId", "projectId");

CREATE TABLE IF NOT EXISTS "PluginManagerIgnoredUpdate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ignoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_pm_ignored_unique" ON "PluginManagerIgnoredUpdate"("serverId", "projectId");

CREATE TABLE IF NOT EXISTS "PluginManagerBackup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fileSize" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
