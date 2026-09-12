CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `shopping_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_session_sequence` ON `audit_events` (`session_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`provider_order_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `shopping_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_session_id` ON `orders` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_idempotency_key` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `shopping_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`intent` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`budget` integer NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`cart_version` text NOT NULL,
	`fit_score` integer NOT NULL,
	`cart_json` text NOT NULL,
	`policy_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`approved_at` text,
	`order_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_created_at` ON `shopping_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_status_created_at` ON `shopping_sessions` (`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
