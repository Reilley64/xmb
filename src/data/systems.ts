export interface Game {
	id: string;
	system_id?: string;
	title: string;
	file_path: string;
	last_played?: number;
	play_count: number;
}

export interface System {
	id: string;
	name: string;
	shortName: string;
	games: Game[];
	commands: { label: string; command: string }[];
}

