ALTER TABLE "labels" ADD COLUMN "color" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "position" text COLLATE "C";--> statement-breakpoint
--> Backfill: existing accounts keep the alphabetical order they have today,
--> frozen into fractional keys. `a0`…`az` in the base62 alphabet the
--> fractional-indexing library uses, which covers the 50-label cap per user.
UPDATE "labels" SET "position" = 'a' || substr(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  LEAST(ordered.rn, 62)::int, 1)
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY lower("name"), "id") AS rn
  FROM "labels"
) AS ordered
WHERE "labels"."id" = ordered."id";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_emoji_len_check" CHECK ("labels"."emoji" is null or char_length("labels"."emoji") between 1 and 16);
