CREATE TABLE `costEvolutionImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`segment` enum('auto_parts','industry') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`status` enum('pending','approved','archived') NOT NULL DEFAULT 'pending',
	`itemCount` int NOT NULL,
	`observationCount` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`importedBy` varchar(320) NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `costEvolutionImports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `costEvolutionItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`branch` varchar(24) NOT NULL,
	`aggregateCode` varchar(120) NOT NULL,
	`code` varchar(120) NOT NULL,
	`mrp` enum('Sim','Não') NOT NULL DEFAULT 'Não',
	`description` varchar(1000) NOT NULL,
	`buyer` varchar(320) NOT NULL DEFAULT '',
	`lastPurchaseDate` date,
	`lastPurchasePrice` decimal(20,6),
	CONSTRAINT `costEvolutionItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `costEvolutionItems_import_business_key_unique` UNIQUE(`importId`,`branch`,`aggregateCode`,`code`)
);
--> statement-breakpoint
CREATE TABLE `costEvolutionObservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`balanceDate` date NOT NULL,
	`cost` decimal(20,6) NOT NULL,
	CONSTRAINT `costEvolutionObservations_id` PRIMARY KEY(`id`),
	CONSTRAINT `costEvolutionObservations_item_date_unique` UNIQUE(`itemId`,`balanceDate`)
);
--> statement-breakpoint
ALTER TABLE `costEvolutionItems` ADD CONSTRAINT `costEvolutionItems_importId_costEvolutionImports_id_fk` FOREIGN KEY (`importId`) REFERENCES `costEvolutionImports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `costEvolutionObservations` ADD CONSTRAINT `costEvolutionObservations_itemId_costEvolutionItems_id_fk` FOREIGN KEY (`itemId`) REFERENCES `costEvolutionItems`(`id`) ON DELETE no action ON UPDATE no action;