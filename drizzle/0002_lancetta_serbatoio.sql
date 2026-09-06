ALTER TABLE `refuels` ADD `tank_fraction_after` real;--> statement-breakpoint
UPDATE `refuels` SET `tank_fraction_after` = CASE `tank_level_after`
  WHEN 'quarter' THEN 0.25
  WHEN 'half' THEN 0.5
  WHEN 'three_quarters' THEN 0.75
  WHEN 'full' THEN 1
END;--> statement-breakpoint
ALTER TABLE `refuels` DROP COLUMN `tank_level_after`;
