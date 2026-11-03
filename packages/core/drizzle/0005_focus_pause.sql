ALTER TABLE `focus_sessions` ADD `paused_at` integer;--> statement-breakpoint
ALTER TABLE `focus_sessions` ADD `paused_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `focus_sessions` ADD `resumed_at` integer;