ALTER TABLE `inventoryAnalytics` ADD `productType` enum('ME','PE') DEFAULT 'ME' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventoryAnalytics` ADD `stockValue` decimal(20,2) DEFAULT '0' NOT NULL;