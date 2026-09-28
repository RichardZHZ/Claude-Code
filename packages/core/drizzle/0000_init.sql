CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activity_at_idx` ON `activity_log` (`at`);--> statement-breakpoint
CREATE TABLE `daily_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`top_task_ids` text DEFAULT '[]' NOT NULL,
	`journal` text,
	`review` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plans_date_unique` ON `daily_plans` (`date`);--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`promoted_type` text,
	`promoted_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`done_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milestones_project_idx` ON `milestones` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_id` integer,
	`title` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`started_at` text,
	`deadline` text,
	`description` text,
	`current_status` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "projects_priority_range" CHECK("projects"."priority" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE INDEX `projects_theme_idx` ON `projects` (`theme_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `resources_owner_idx` ON `resources` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`theme_id` integer,
	`milestone_id` integer,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`estimate_min` integer,
	`scheduled_date` text,
	`week_key` text,
	`done_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tasks_has_owner" CHECK("tasks"."project_id" IS NOT NULL OR "tasks"."theme_id" IS NOT NULL),
	CONSTRAINT "tasks_priority_range" CHECK("tasks"."priority" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_theme_idx` ON `tasks` (`theme_id`);--> statement-breakpoint
CREATE INDEX `tasks_week_idx` ON `tasks` (`week_key`);--> statement-breakpoint
CREATE INDEX `tasks_scheduled_idx` ON `tasks` (`scheduled_date`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE TABLE `themes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`core_questions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text,
	`review_cadence_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_key` text NOT NULL,
	`focus` text DEFAULT '[]' NOT NULL,
	`review` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_plans_week_key_unique` ON `weekly_plans` (`week_key`);