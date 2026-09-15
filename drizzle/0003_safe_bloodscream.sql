CREATE TABLE `experiment_assignments` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`exposed_at` integer,
	`converted_at` integer,
	`session_id` text,
	`ordered_at` integer,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
