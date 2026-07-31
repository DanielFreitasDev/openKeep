CREATE TABLE "note_share_links" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "note_share_links" ADD CONSTRAINT "note_share_links_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_share_links" ADD CONSTRAINT "note_share_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;