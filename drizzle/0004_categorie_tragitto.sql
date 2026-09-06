CREATE TABLE `trip_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_categories_name_unique` ON `trip_categories` (`name`);--> statement-breakpoint
ALTER TABLE `trips` ADD `category_id` text REFERENCES trip_categories(id);
