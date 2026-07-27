CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_name_len_check" CHECK (char_length("labels"."name") between 1 and 225)
);
--> statement-breakpoint
CREATE TABLE "note_labels" (
	"note_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_labels_note_id_user_id_label_id_pk" PRIMARY KEY("note_id","user_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_membership_fk" FOREIGN KEY ("note_id","user_id") REFERENCES "public"."note_members"("note_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_user_lower_name_uq" ON "labels" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "note_labels_label_idx" ON "note_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "note_labels_user_idx" ON "note_labels" USING btree ("user_id");