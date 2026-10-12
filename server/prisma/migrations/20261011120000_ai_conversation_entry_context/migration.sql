-- Stores only the explicitly selected business menu, operation and date.
ALTER TABLE "AiConversation" ADD COLUMN "entryContext" JSONB;
