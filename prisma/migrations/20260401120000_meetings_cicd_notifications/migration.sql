-- AlterTable Meeting: make pickedSlot/summary optional with defaults, add transcript and recording
ALTER TABLE "Meeting" ALTER COLUMN "pickedSlot" SET DEFAULT '';
ALTER TABLE "Meeting" ALTER COLUMN "summary" SET DEFAULT '';
ALTER TABLE "Meeting" ADD COLUMN "transcript" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "recording" TEXT;

-- AlterTable Notification: add entityType, entityId, role, read, createdAt
ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "role" "MemberRole";
ALTER TABLE "Notification" ADD COLUMN "read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
