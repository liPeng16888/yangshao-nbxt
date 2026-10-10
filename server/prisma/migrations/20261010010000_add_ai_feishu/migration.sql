-- Additive: only new Feishu channel tables and indexes. Existing business records are untouched.

-- CreateTable
CREATE TABLE "AiFeishuConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "appId" TEXT NOT NULL DEFAULT '',
    "appSecretCipher" TEXT NOT NULL DEFAULT '',
    "publicSiteUrl" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "workerId" TEXT,
    "workerUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeishuConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeishuBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "defaultModelId" TEXT NOT NULL,
    "roleSnapshot" TEXT NOT NULL,
    "ownerSnapshot" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeishuBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeishuInvitation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultModelId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "proofHash" TEXT,
    "tenantKey" TEXT,
    "openId" TEXT,
    "chatId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeishuInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeishuSession" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "bindingId" TEXT,
    "ownerId" TEXT,
    "conversationId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "authorityHash" TEXT,
    "grantsCipher" TEXT,
    "accessProofHash" TEXT,
    "accessProofExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeishuSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeishuAction" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionRevision" INTEGER NOT NULL,
    "bindingId" TEXT,
    "bindingRevision" INTEGER,
    "configRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeishuAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeishuEvent" (
    "sequence" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "configRevision" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "inputCipher" TEXT NOT NULL,
    "outputCipher" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeishuEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuBinding_userId_key" ON "AiFeishuBinding"("userId");

-- CreateIndex
CREATE INDEX "AiFeishuBinding_appId_tenantKey_openId_idx" ON "AiFeishuBinding"("appId", "tenantKey", "openId");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuInvitation_codeHash_key" ON "AiFeishuInvitation"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuInvitation_proofHash_key" ON "AiFeishuInvitation"("proofHash");

-- CreateIndex
CREATE INDEX "AiFeishuInvitation_userId_expiresAt_idx" ON "AiFeishuInvitation"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuSession_accessProofHash_key" ON "AiFeishuSession"("accessProofHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuSession_appId_tenantKey_openId_chatId_key" ON "AiFeishuSession"("appId", "tenantKey", "openId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuAction_tokenHash_key" ON "AiFeishuAction"("tokenHash");

-- CreateIndex
CREATE INDEX "AiFeishuAction_sessionId_expiresAt_idx" ON "AiFeishuAction"("sessionId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuEvent_sequence_key" ON "AiFeishuEvent"("sequence");

-- CreateIndex
CREATE INDEX "AiFeishuEvent_status_nextAttemptAt_createdAt_idx" ON "AiFeishuEvent"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeishuEvent_appId_eventKey_key" ON "AiFeishuEvent"("appId", "eventKey");
