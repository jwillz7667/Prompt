-- Abuse reports must outlive the reported message: regenerating a reply or
-- deleting the conversation hard-deletes messages, which used to cascade to
-- the report before anyone reviewed it. Reports now keep a snapshot of the
-- reported text and only lose the link (SET NULL) when the message goes.
-- The table is new in this release, so the backfill and NOT NULL are instant.

ALTER TABLE "ChatMessageReport" ADD COLUMN "messageContent" TEXT;

UPDATE "ChatMessageReport" AS report
SET "messageContent" = message."content"
FROM "ChatMessage" AS message
WHERE message."id" = report."messageId";

UPDATE "ChatMessageReport" SET "messageContent" = '' WHERE "messageContent" IS NULL;

ALTER TABLE "ChatMessageReport" ALTER COLUMN "messageContent" SET NOT NULL;

ALTER TABLE "ChatMessageReport" ALTER COLUMN "messageId" DROP NOT NULL;

ALTER TABLE "ChatMessageReport" DROP CONSTRAINT "ChatMessageReport_messageId_fkey";

ALTER TABLE "ChatMessageReport" ADD CONSTRAINT "ChatMessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
