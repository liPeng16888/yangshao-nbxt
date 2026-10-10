-- Additive migration: no existing business tables or records are changed.
CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL DEFAULT 'global', "enabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1, "dailyRequestLimit" INTEGER NOT NULL DEFAULT 50,
  "blockedFields" JSONB NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiModel" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "modelId" TEXT NOT NULL, "baseUrl" TEXT NOT NULL,
  "apiKeyCipher" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "vision" BOOLEAN NOT NULL DEFAULT false,
  "tools" BOOLEAN NOT NULL DEFAULT true, "allowedUserIds" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiPolicy" (
  "subjectId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "rules" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AiPolicy_pkey" PRIMARY KEY ("subjectId")
);
CREATE TABLE "AiConversation" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "modelId" TEXT NOT NULL,
  "settingsRevision" INTEGER NOT NULL, "authorizationHash" TEXT NOT NULL, "processingUntil" TIMESTAMP(3), "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiMessage" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiProposal" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "resource" TEXT NOT NULL, "operation" TEXT NOT NULL, "payload" JSONB NOT NULL, "preview" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiProposal_status_check" CHECK ("status" IN ('PENDING', 'APPLIED', 'REJECTED', 'EXPIRED'))
);
CREATE TABLE "AiAttachment" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "mediaType" TEXT NOT NULL, "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiAttachment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiAuditLog" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "ownerId" TEXT, "modelId" TEXT, "action" TEXT NOT NULL,
  "resource" TEXT, "proposalId" TEXT, "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiConversation_actorId_ownerId_updatedAt_idx" ON "AiConversation"("actorId", "ownerId", "updatedAt");
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");
CREATE INDEX "AiProposal_actorId_status_idx" ON "AiProposal"("actorId", "status");
CREATE INDEX "AiAttachment_actorId_expiresAt_idx" ON "AiAttachment"("actorId", "expiresAt");
CREATE INDEX "AiAuditLog_actorId_createdAt_idx" ON "AiAuditLog"("actorId", "createdAt");
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
