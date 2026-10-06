CREATE TYPE "public"."cost_evolution_segment" AS ENUM('auto_parts', 'industry');--> statement-breakpoint
CREATE TYPE "public"."cost_evolution_status" AS ENUM('pending', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."curve_class" AS ENUM('A', 'B', 'C', 'D', 'E');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pendente', 'recebido');--> statement-breakpoint
CREATE TYPE "public"."mrp_status" AS ENUM('Sim', 'Não');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('ME', 'PE');--> statement-breakpoint
CREATE TYPE "public"."protheus_import_status" AS ENUM('pending', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('rascunho', 'aprovado', 'enviado', 'recebido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sheet_type" AS ENUM('pecas', 'industria');--> statement-breakpoint
CREATE TABLE "costEvolutionImports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "costEvolutionImports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"segment" "cost_evolution_segment" NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileKey" varchar(512) NOT NULL,
	"status" "cost_evolution_status" DEFAULT 'pending' NOT NULL,
	"itemCount" integer NOT NULL,
	"observationCount" integer NOT NULL,
	"periodStart" date NOT NULL,
	"periodEnd" date NOT NULL,
	"importedBy" varchar(320) NOT NULL,
	"importedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "costEvolutionItems" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "costEvolutionItems_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importId" integer NOT NULL,
	"branch" varchar(24) NOT NULL,
	"aggregateCode" varchar(120) NOT NULL,
	"code" varchar(120) NOT NULL,
	"mrp" "mrp_status" DEFAULT 'Não' NOT NULL,
	"description" varchar(1000) NOT NULL,
	"ultimaCompra" date,
	"buyer" varchar(320) DEFAULT '' NOT NULL,
	"lastPurchaseDate" date,
	"lastPurchasePrice" numeric(20, 6)
);
--> statement-breakpoint
CREATE TABLE "costEvolutionObservations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "costEvolutionObservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importId" integer NOT NULL,
	"itemId" integer,
	"balanceDate" date NOT NULL,
	"cost" numeric(20, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purchaseOrderId" integer NOT NULL,
	"expectedAt" timestamp NOT NULL,
	"actualAt" timestamp,
	"status" "delivery_status" DEFAULT 'pendente' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "familyReferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "familyReferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(120) NOT NULL,
	"descricao" varchar(255) DEFAULT '' NOT NULL,
	CONSTRAINT "familyReferences_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventoryAnalytics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventoryAnalytics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importId" integer NOT NULL,
	"code" varchar(120) NOT NULL,
	"codeOriginal" varchar(120) DEFAULT '' NOT NULL,
	"description" varchar(1000) NOT NULL,
	"ultimaCompra" date,
	"pedidos" numeric(20, 3) DEFAULT '0' NOT NULL,
	"branch" varchar(24) NOT NULL,
	"productType" "product_type" DEFAULT 'ME' NOT NULL,
	"mrp" "mrp_status" DEFAULT 'Não' NOT NULL,
	"family" varchar(255) DEFAULT '' NOT NULL,
	"subfamily" varchar(255) DEFAULT '' NOT NULL,
	"curve" "curve_class" NOT NULL,
	"sales13M" numeric(20, 3) NOT NULL,
	"salesValue13M" numeric(20, 2) DEFAULT '0' NOT NULL,
	"stock" numeric(20, 3) NOT NULL,
	"stockValue" numeric(20, 2) DEFAULT '0' NOT NULL,
	"coverageDays" numeric(20, 3) NOT NULL,
	"excessValue" numeric(20, 2) NOT NULL,
	"capitalTurnover" numeric(20, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventoryItems" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventoryItems_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item" varchar(200) NOT NULL,
	"quantityAvailable" integer NOT NULL,
	"reorderPoint" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protheusImports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "protheusImports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fileName" varchar(255) NOT NULL,
	"versionName" varchar(32) DEFAULT 'Compras - legado' NOT NULL,
	"status" "protheus_import_status" DEFAULT 'pending' NOT NULL,
	"fileKey" varchar(512) NOT NULL,
	"rowCount" integer NOT NULL,
	"importedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseOrders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchaseOrders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplierId" integer NOT NULL,
	"status" "purchase_order_status" DEFAULT 'rascunho' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referenceImports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "referenceImports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" varchar(32) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"rowCount" integer DEFAULT 0 NOT NULL,
	"importedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sb1References" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sb1References_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(120) NOT NULL,
	"tipo" varchar(24) DEFAULT '' NOT NULL,
	"familiaCode" varchar(120) DEFAULT '' NOT NULL,
	"subfamiliaCode" varchar(120) DEFAULT '' NOT NULL,
	CONSTRAINT "sb1References_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sbzReferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sbzReferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chave" varchar(255) NOT NULL,
	"code" varchar(120) NOT NULL,
	"filial" varchar(24) NOT NULL,
	"estoqMin" numeric(20, 3),
	"estoqMax" numeric(20, 3),
	"entraMrp" varchar(24) DEFAULT '' NOT NULL,
	CONSTRAINT "sbzReferences_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "stockMovements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stockMovements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"inventoryItemId" integer NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"occurredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subfamilyReferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subfamilyReferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" varchar(120) NOT NULL,
	"descricao" varchar(255) DEFAULT '' NOT NULL,
	CONSTRAINT "subfamilyReferences_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(200) NOT NULL,
	"contact" varchar(200) NOT NULL,
	"category" varchar(120) NOT NULL,
	"deliveryLeadTime" integer NOT NULL,
	"evaluation" numeric(4, 1) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" varchar(320),
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "cost_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"filial" varchar NOT NULL,
	"sheet_type" "sheet_type" NOT NULL,
	"cod_agregado" varchar NOT NULL,
	"codigo" varchar NOT NULL,
	"entra_mrp" boolean,
	"descricao" text,
	"comprador_codigo" varchar,
	"comprador_nome" varchar,
	"ultima_compra" varchar,
	"ultimo_preco" numeric,
	"period" varchar NOT NULL,
	"custo_medio" numeric,
	"source_file" varchar,
	"imported_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "costEvolutionItems" ADD CONSTRAINT "costEvolutionItems_importId_costEvolutionImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."costEvolutionImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costEvolutionObservations" ADD CONSTRAINT "costEvolutionObservations_importId_costEvolutionImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."costEvolutionImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costEvolutionObservations" ADD CONSTRAINT "costEvolutionObservations_itemId_costEvolutionItems_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."costEvolutionItems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purchaseOrderId_purchaseOrders_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryAnalytics" ADD CONSTRAINT "inventoryAnalytics_importId_protheusImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."protheusImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrders" ADD CONSTRAINT "purchaseOrders_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventoryAnalytics_import_code_branch_unique" ON "inventoryAnalytics" USING btree ("importId","code","branch");