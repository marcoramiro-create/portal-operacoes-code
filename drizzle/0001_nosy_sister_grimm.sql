CREATE TABLE `deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`expectedAt` timestamp NOT NULL,
	`actualAt` timestamp,
	`status` enum('pendente','recebido') NOT NULL DEFAULT 'pendente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventoryItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item` varchar(200) NOT NULL,
	`quantityAvailable` int NOT NULL,
	`reorderPoint` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventoryItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`status` enum('rascunho','aprovado','enviado','recebido','cancelado') NOT NULL DEFAULT 'rascunho',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchaseOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inventoryItemId` int NOT NULL,
	`type` enum('entrada','saida') NOT NULL,
	`quantity` int NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`contact` varchar(200) NOT NULL,
	`category` varchar(120) NOT NULL,
	`deliveryLeadTime` int NOT NULL,
	`evaluation` decimal(4,1) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(320);--> statement-breakpoint
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_purchaseOrderId_purchaseOrders_id_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchaseOrders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchaseOrders` ADD CONSTRAINT `purchaseOrders_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_inventoryItemId_inventoryItems_id_fk` FOREIGN KEY (`inventoryItemId`) REFERENCES `inventoryItems`(`id`) ON DELETE no action ON UPDATE no action;