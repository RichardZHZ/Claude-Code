CREATE TABLE `focus_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_id` integer NOT NULL,
	`mode` text NOT NULL,
	`planned_minutes` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "focus_sessions_planned" CHECK(("focus_sessions"."mode" = 'timer' AND "focus_sessions"."planned_minutes" > 0) OR ("focus_sessions"."mode" = 'stopwatch' AND "focus_sessions"."planned_minutes" IS NULL)),
	CONSTRAINT "focus_sessions_order" CHECK("focus_sessions"."ended_at" IS NULL OR "focus_sessions"."ended_at" >= "focus_sessions"."started_at")
);
--> statement-breakpoint
CREATE INDEX `focus_sessions_theme_idx` ON `focus_sessions` (`theme_id`);--> statement-breakpoint
CREATE INDEX `focus_sessions_started_idx` ON `focus_sessions` (`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `focus_sessions_one_running` ON `focus_sessions` (("ended_at" IS NULL)) WHERE "focus_sessions"."ended_at" IS NULL;