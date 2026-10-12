-- Only add Feishu selection state; [] keeps existing single-owner sessions valid.
ALTER TABLE "AiFeishuSession" ADD COLUMN "ownerIds" JSONB NOT NULL DEFAULT '[]';
