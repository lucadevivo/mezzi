ALTER TABLE `ledger_entries` ADD `amount_km` real DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TABLE IF EXISTS `expenses`;--> statement-breakpoint
DROP TABLE IF EXISTS `settlements`;
