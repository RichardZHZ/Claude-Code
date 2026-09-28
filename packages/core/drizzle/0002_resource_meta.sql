ALTER TABLE `resources` ADD `meta` text;--> statement-breakpoint
CREATE UNIQUE INDEX `resources_owner_ref_unique` ON `resources` (`owner_type`,`owner_id`,`kind`,`ref`);