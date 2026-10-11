-- Add scope metadata only. Legacy [] scopes retain the existing single ownerId.
ALTER TABLE "AiConversation" ADD COLUMN "ownerIds" JSONB NOT NULL DEFAULT '[]';
