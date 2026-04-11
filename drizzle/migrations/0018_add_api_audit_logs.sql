CREATE TABLE `api_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_prefix` text NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`method` text NOT NULL,
	`status_code` integer NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
