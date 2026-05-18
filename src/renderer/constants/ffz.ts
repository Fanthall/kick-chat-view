export interface FfzEmoteUrls {
	"1"?: string;
	"2"?: string;
	"4"?: string;
}

export interface FfzEmote {
	id: number;
	name: string;
	urls: FfzEmoteUrls;
	width?: number;
	height?: number;
	animated?: FfzEmoteUrls | null;
	owner?: { _id?: number; name?: string; display_name?: string } | null;
	margins?: string | null;
}

export interface FfzSet {
	id: number;
	_type?: number;
	title?: string;
	emoticons: FfzEmote[];
}

export interface FfzSetsResponse {
	default_sets?: number[];
	sets: Record<string, FfzSet>;
}

export interface FfzRoomResponse {
	room?: {
		_id?: number;
		twitch_id?: number;
		id?: string;
		set?: number;
	};
	sets: Record<string, FfzSet>;
}
