CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`period_key` text NOT NULL,
	`content` text NOT NULL,
	`stats` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_period_idx` ON `reviews` (`kind`,`period_key`);--> statement-breakpoint
ALTER TABLE `activity_log` ADD `project_id` integer;--> statement-breakpoint
ALTER TABLE `activity_log` ADD `theme_id` integer;--> statement-breakpoint
CREATE INDEX `activity_project_idx` ON `activity_log` (`project_id`,`at`);--> statement-breakpoint
CREATE INDEX `activity_theme_idx` ON `activity_log` (`theme_id`,`at`);