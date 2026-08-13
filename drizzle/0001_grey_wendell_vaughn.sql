CREATE TABLE `hand_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`room_code` text NOT NULL,
	`room_name` text NOT NULL,
	`room_mode` text NOT NULL,
	`hand_number` integer NOT NULL,
	`user_id` text NOT NULL,
	`player_name` text NOT NULL,
	`net` integer NOT NULL,
	`ending_chips` integer NOT NULL,
	`won` integer NOT NULL,
	`result_text` text NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_hand_results_unique_player_hand` ON `hand_results` (`room_id`,`hand_number`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_hand_results_user_completed` ON `hand_results` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_hand_results_room_hand` ON `hand_results` (`room_id`,`hand_number`);