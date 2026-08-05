--> Sub-labels. Uniqueness moves from "per account" to "per parent", so an
--> account can hold Work/Ideas and Personal/Ideas at the same time. Every
--> existing row keeps parent_id NULL and the new index coalesces NULL to the
--> nil uuid, so on today's data the two indexes are the same constraint — no
--> account can be holding a pair the new one would reject.
DROP INDEX "labels_user_lower_name_uq";--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_parent_id_labels_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_user_parent_lower_name_uq" ON "labels" USING btree ("user_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "labels_parent_idx" ON "labels" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_no_self_parent_check" CHECK ("labels"."parent_id" is distinct from "labels"."id");