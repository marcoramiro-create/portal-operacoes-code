ALTER TABLE `inventoryAnalytics` ADD `family` varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventoryAnalytics` ADD `subfamily` varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventoryAnalytics` ADD `salesValue13M` decimal(20,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventoryAnalytics` ADD `capitalTurnover` decimal(20,3) DEFAULT '0' NOT NULL;