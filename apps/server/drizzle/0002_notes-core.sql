CREATE TABLE "note_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"indent" integer DEFAULT 0 NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('openkeep', coalesce(text, '')), 'B')) STORED,
	CONSTRAINT "note_items_text_len_check" CHECK (char_length("note_items"."text") <= 1000),
	CONSTRAINT "note_items_indent_check" CHECK ("note_items"."indent" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "note_members" (
	"note_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT 'default' NOT NULL,
	"background" text DEFAULT 'none' NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_members_note_id_user_id_pk" PRIMARY KEY("note_id","user_id"),
	CONSTRAINT "note_members_role_check" CHECK ("note_members"."role" in ('owner', 'collaborator')),
	CONSTRAINT "note_members_color_check" CHECK (color in ('default','coral','peach','sand','mint','sage','fog','storm','dusk','blossom','clay','chalk')),
	CONSTRAINT "note_members_background_check" CHECK (background in ('none','groceries','food','music','recipes','notes','places','travel','video','celebration'))
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"items" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"has_links" boolean DEFAULT false NOT NULL,
	"trashed_at" timestamp with time zone,
	"last_edited_by" text,
	"imported_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('openkeep', coalesce(title, '')), 'A') || setweight(to_tsvector('openkeep', coalesce(body_text, '')), 'B')) STORED,
	CONSTRAINT "notes_type_check" CHECK ("notes"."type" in ('text', 'list')),
	CONSTRAINT "notes_title_len_check" CHECK (char_length("notes"."title") <= 1000),
	CONSTRAINT "notes_body_text_len_check" CHECK (char_length("notes"."body_text") <= 20000),
	CONSTRAINT "notes_body_html_len_check" CHECK (char_length("notes"."body_html") <= 100000)
);
--> statement-breakpoint
ALTER TABLE "note_items" ADD CONSTRAINT "note_items_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_members" ADD CONSTRAINT "note_members_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_members" ADD CONSTRAINT "note_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_last_edited_by_user_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_items_note_idx" ON "note_items" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_items_search_idx" ON "note_items" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "note_members_one_owner_uq" ON "note_members" USING btree ("note_id") WHERE role = 'owner';--> statement-breakpoint
CREATE INDEX "note_members_user_idx" ON "note_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "note_versions_note_idx" ON "note_versions" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_owner_idx" ON "notes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notes_trashed_idx" ON "notes" USING btree ("trashed_at") WHERE "notes"."trashed_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_owner_fingerprint_uq" ON "notes" USING btree ("owner_id","imported_fingerprint") WHERE "notes"."imported_fingerprint" is not null;--> statement-breakpoint
CREATE INDEX "notes_search_idx" ON "notes" USING gin ("search_tsv");