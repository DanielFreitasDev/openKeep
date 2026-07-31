ALTER TABLE "user_settings" ADD COLUMN "calendar_token" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_calendarToken_unique" UNIQUE("calendar_token");