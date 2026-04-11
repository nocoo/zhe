CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
