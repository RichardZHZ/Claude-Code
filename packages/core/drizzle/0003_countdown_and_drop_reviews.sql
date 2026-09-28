DROP TABLE `reviews`;--> statement-breakpoint
ALTER TABLE `themes` ADD `countdown_at` integer;--> statement-breakpoint
ALTER TABLE `daily_plans` DROP COLUMN `journal`;--> statement-breakpoint
ALTER TABLE `daily_plans` DROP COLUMN `review`;--> statement-breakpoint
ALTER TABLE `daily_plans` DROP COLUMN `reviewed_at`;--> statement-breakpoint
ALTER TABLE `weekly_plans` DROP COLUMN `review`;--> statement-breakpoint
ALTER TABLE `weekly_plans` DROP COLUMN `reviewed_at`;