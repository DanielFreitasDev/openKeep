CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"signup_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_singleton_check" CHECK ("instance_settings"."id" = 'singleton')
);
