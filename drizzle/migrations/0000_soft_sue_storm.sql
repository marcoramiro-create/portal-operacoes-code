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
CREATE TYPE "public"."abc_class" AS ENUM('A', 'B', 'C', 'D', 'E');--> statement-breakpoint
CREATE TYPE "public"."alert_level" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
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
CREATE TABLE "inventoryAnalytics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventoryAnalytics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importId" integer NOT NULL,
	"code" varchar(120) NOT NULL,
	"description" varchar(1000) NOT NULL,
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
CREATE TABLE "stockMovements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stockMovements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"inventoryItemId" integer NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"occurredAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "abc_classification" (
	"id" serial PRIMARY KEY NOT NULL,
	"filial" varchar(10) NOT NULL,
	"sheet_type" "sheet_type" NOT NULL,
	"cod_agregado" varchar(50) NOT NULL,
	"descricao" text,
	"total_spend" numeric(16, 2),
	"total_qty" integer,
	"pct_of_total" numeric(8, 4),
	"pct_accumulated" numeric(8, 4),
	"abc_class" "abc_class" NOT NULL,
	"item_count" integer,
	"period_start" varchar(7),
	"period_end" varchar(7),
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cost_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"filial" varchar(10) NOT NULL,
	"sheet_type" "sheet_type" NOT NULL,
	"cod_agregado" varchar(50) NOT NULL,
	"codigo" varchar(50) NOT NULL,
	"entra_mrp" boolean,
	"descricao" text,
	"comprador_codigo" varchar(10),
	"comprador_nome" varchar(100),
	"ultima_compra" varchar(8),
	"ultimo_preco" numeric(14, 4),
	"period" varchar(7) NOT NULL,
	"custo_medio" numeric(14, 4),
	"source_file" varchar(255),
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "industry_benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"indicator" varchar(20) NOT NULL,
	"period" varchar(7) NOT NULL,
	"monthly_rate" numeric(8, 4),
	"accumulated_rate" numeric(8, 4),
	"source" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"filial" varchar(10) NOT NULL,
	"codigo" varchar(50) NOT NULL,
	"descricao" text,
	"descricao_detalhada" text,
	"fornecedor" text,
	"cod_prod_fornecedor" varchar(50),
	"locacao" varchar(20),
	"agregado" text,
	"comprador_codigo" varchar(10),
	"comprador_nome" varchar(100),
	"ultima_compra" varchar(8),
	"period" varchar(7) NOT NULL,
	"quantidade" integer DEFAULT 0,
	"qtd_13m" integer,
	"custo_un_13m" numeric(14, 4),
	"source_file" varchar(255),
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spend_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"filial" varchar(10) NOT NULL,
	"sheet_type" "sheet_type" NOT NULL,
	"cod_agregado" varchar(50) NOT NULL,
	"codigo" varchar(50) NOT NULL,
	"descricao" text,
	"fornecedor" text,
	"comprador_codigo" varchar(10),
	"period" varchar(7) NOT NULL,
	"custo_medio" numeric(14, 4),
	"quantidade" integer,
	"total_spend" numeric(16, 2),
	"mom_variation" numeric(10, 4),
	"yoy_variation" numeric(10, 4),
	"alert_level" "alert_level",
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "costEvolutionItems" ADD CONSTRAINT "costEvolutionItems_importId_costEvolutionImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."costEvolutionImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costEvolutionObservations" ADD CONSTRAINT "costEvolutionObservations_importId_costEvolutionImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."costEvolutionImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costEvolutionObservations" ADD CONSTRAINT "costEvolutionObservations_itemId_costEvolutionItems_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."costEvolutionItems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purchaseOrderId_purchaseOrders_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryAnalytics" ADD CONSTRAINT "inventoryAnalytics_importId_protheusImports_id_fk" FOREIGN KEY ("importId") REFERENCES "public"."protheusImports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrders" ADD CONSTRAINT "purchaseOrders_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventoryAnalytics_import_code_branch_unique" ON "inventoryAnalytics" USING btree ("importId","code","branch");--> statement-breakpoint
CREATE UNIQUE INDEX "abc_uniq" ON "abc_classification" USING btree ("filial","sheet_type","cod_agregado","period_end");--> statement-breakpoint
CREATE INDEX "abc_class" ON "abc_classification" USING btree ("abc_class");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_uniq" ON "cost_records" USING btree ("filial","codigo","period");--> statement-breakpoint
CREATE INDEX "cost_filial_period" ON "cost_records" USING btree ("filial","period");--> statement-breakpoint
CREATE INDEX "cost_agregado" ON "cost_records" USING btree ("cod_agregado");--> statement-breakpoint
CREATE INDEX "cost_comprador" ON "cost_records" USING btree ("comprador_codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "bench_uniq" ON "industry_benchmarks" USING btree ("indicator","period");--> statement-breakpoint
CREATE UNIQUE INDEX "purch_uniq" ON "purchase_records" USING btree ("filial","codigo","period");--> statement-breakpoint
CREATE INDEX "purch_filial" ON "purchase_records" USING btree ("filial");--> statement-breakpoint
CREATE INDEX "purch_fornecedor" ON "purchase_records" USING btree ("fornecedor");--> statement-breakpoint
CREATE UNIQUE INDEX "spend_uniq" ON "spend_summary" USING btree ("filial","codigo","period");--> statement-breakpoint
CREATE INDEX "spend_filial_period" ON "spend_summary" USING btree ("filial","sheet_type","period");--> statement-breakpoint
CREATE INDEX "spend_alert" ON "spend_summary" USING btree ("alert_level");