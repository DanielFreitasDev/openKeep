ALTER TABLE "attachments" DROP CONSTRAINT "attachments_kind_check";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_filename_check" CHECK (("attachments"."kind" <> 'file') = ("attachments"."filename" is null));--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_kind_check" CHECK ("attachments"."kind" in ('image', 'audio', 'drawing', 'file'));