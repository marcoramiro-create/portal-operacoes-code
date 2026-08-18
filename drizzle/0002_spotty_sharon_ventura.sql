CREATE TABLE `inventoryAnalytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`code` varchar(120) NOT NULL,
	`description` varchar(1000) NOT NULL,
	`branch` varchar(24) NOT NULL,
	`curve` enum('A','B','C','D','E') NOT NULL,
	`sales13M` decimal(20,3) NOT NULL,
	`stock` decimal(20,3) NOT NULL,
	`coverageDays` decimal(20,3) NOT NULL,
	`excessValue` decimal(20,2) NOT NULL,
	CONSTRAINT `inventoryAnalytics_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventoryAnalytics_import_code_branch_unique` UNIQUE(`importId`,`code`,`branch`)
);
--> statement-breakpoint
CREATE TABLE `protheusImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`rowCount` int NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `protheusImports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventoryAnalytics` ADD CONSTRAINT `inventoryAnalytics_importId_protheusImports_id_fk` FOREIGN KEY (`importId`) REFERENCES `protheusImports`(`id`) ON DELETE no action ON UPDATE no action;