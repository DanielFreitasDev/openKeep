CREATE TABLE "user_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"file_key" text,
	"error" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "user_jobs_kind_check" CHECK ("user_jobs"."kind" in ('import', 'export')),
	CONSTRAINT "user_jobs_status_check" CHECK ("user_jobs"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "user_jobs" ADD CONSTRAINT "user_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_jobs_user_idx" ON "user_jobs" USING btree ("user_id","created_at");