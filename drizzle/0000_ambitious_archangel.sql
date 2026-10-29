CREATE TABLE `desks` (
	`id` text PRIMARY KEY NOT NULL,
	`occupied` integer DEFAULT 0 NOT NULL,
	`student_id` text,
	`token_hash` text,
	`reserved_until` integer
);
