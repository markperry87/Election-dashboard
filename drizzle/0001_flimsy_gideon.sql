CREATE TABLE `election_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`fetched_at` text NOT NULL,
	`payload` text NOT NULL
);
