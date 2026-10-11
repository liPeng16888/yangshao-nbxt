-- Keep the existing robot, secret and revision. Only Feishu channel tables change.
-- Prefer the audience of active bindings, falling back to the configured site.
UPDATE "AiFeishuConfig" c SET "id" = CASE
  WHEN EXISTS (SELECT 1 FROM "AiFeishuBinding" b JOIN "User" u ON u."id" = b."userId"
    WHERE b."appId" = c."appId" AND b."enabled" AND b."revokedAt" IS NULL AND u."role"::text IN ('ROOT_ADMIN', 'SUB_ADMIN'))
   AND NOT EXISTS (SELECT 1 FROM "AiFeishuBinding" b JOIN "User" u ON u."id" = b."userId"
    WHERE b."appId" = c."appId" AND b."enabled" AND b."revokedAt" IS NULL AND u."role"::text IN ('FRONTEND_USER', 'FRONTEND_SUB_USER')) THEN 'admin'
  WHEN EXISTS (SELECT 1 FROM "AiFeishuBinding" b JOIN "User" u ON u."id" = b."userId"
    WHERE b."appId" = c."appId" AND b."enabled" AND b."revokedAt" IS NULL AND u."role"::text IN ('FRONTEND_USER', 'FRONTEND_SUB_USER')) THEN 'frontend'
  WHEN c."publicSiteUrl" ~ '^https://ys\.ysjc\.art/?$' THEN 'admin'
  ELSE 'frontend' END,
  "workerId" = NULL, "workerUntil" = NULL
WHERE c."id" = 'global';

INSERT INTO "AiFeishuConfig" ("id", "updatedAt") VALUES ('frontend', CURRENT_TIMESTAMP), ('admin', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
ALTER TABLE "AiFeishuConfig" ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "AiFeishuBinding" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'frontend';
ALTER TABLE "AiFeishuInvitation" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'frontend';
ALTER TABLE "AiFeishuSession" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'frontend';
ALTER TABLE "AiFeishuEvent" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'frontend';
UPDATE "AiFeishuBinding" b SET "configId" = CASE WHEN u."role"::text IN ('ROOT_ADMIN', 'SUB_ADMIN') THEN 'admin' ELSE 'frontend' END FROM "User" u WHERE u."id" = b."userId";
UPDATE "AiFeishuInvitation" i SET "configId" = CASE WHEN u."role"::text IN ('ROOT_ADMIN', 'SUB_ADMIN') THEN 'admin' ELSE 'frontend' END FROM "User" u WHERE u."id" = i."userId";
UPDATE "AiFeishuSession" s SET "configId" = c."id" FROM "AiFeishuConfig" c WHERE c."appId" <> '' AND c."appId" = s."appId";
UPDATE "AiFeishuEvent" e SET "configId" = c."id" FROM "AiFeishuConfig" c WHERE c."appId" <> '' AND c."appId" = e."appId";

-- A legacy mixed-audience robot cannot silently grant access on the other robot.
-- Keep the row for audit, but require a fresh invitation on the correct audience.
UPDATE "AiFeishuBinding" b SET "enabled" = FALSE, "revokedAt" = CURRENT_TIMESTAMP, "revision" = b."revision" + 1
WHERE b."revokedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "AiFeishuConfig" c WHERE c."id" = b."configId" AND c."appId" = b."appId" AND c."appId" <> '');
UPDATE "AiFeishuInvitation" i SET "usedAt" = CURRENT_TIMESTAMP
WHERE i."usedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "AiFeishuConfig" c WHERE c."id" = i."configId" AND c."appId" = i."appId" AND c."appId" <> '');

DROP INDEX "AiFeishuSession_appId_tenantKey_openId_chatId_key";
CREATE UNIQUE INDEX "AiFeishuSession_configId_appId_tenantKey_openId_chatId_key" ON "AiFeishuSession" ("configId", "appId", "tenantKey", "openId", "chatId");
CREATE INDEX "AiFeishuConfig_appId_idx" ON "AiFeishuConfig" ("appId");
-- Two connections using the same App ID would compete for events.
CREATE UNIQUE INDEX "AiFeishuConfig_nonempty_appId_key" ON "AiFeishuConfig" ("appId") WHERE "appId" <> '';
CREATE INDEX "AiFeishuBinding_configId_idx" ON "AiFeishuBinding" ("configId");
CREATE INDEX "AiFeishuInvitation_configId_idx" ON "AiFeishuInvitation" ("configId");
CREATE INDEX "AiFeishuEvent_configId_status_sequence_idx" ON "AiFeishuEvent" ("configId", "status", "sequence");
ALTER TABLE "AiFeishuConfig" ADD CONSTRAINT "AiFeishuConfig_audience_check" CHECK ("id" IN ('frontend', 'admin'));
ALTER TABLE "AiFeishuBinding" ADD CONSTRAINT "AiFeishuBinding_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AiFeishuConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiFeishuInvitation" ADD CONSTRAINT "AiFeishuInvitation_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AiFeishuConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiFeishuSession" ADD CONSTRAINT "AiFeishuSession_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AiFeishuConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiFeishuEvent" ADD CONSTRAINT "AiFeishuEvent_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AiFeishuConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
