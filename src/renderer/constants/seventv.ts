export interface ChannelEmotes {
	id: string;
	name: string;
	flags: number;
	tags: any[];
	immutable: boolean;
	privileged: boolean;
	emotes: Emote[];
	emote_count: number;
	capacity: number;
	owner: ChannelOwner;
}

export interface Emote {
	id: string;
	name: string;
	flags: number;
	timestamp: number;
	actor_id?: string;
	data: Data;
}

export interface Data {
	id: string;
	name: string;
	flags: number;
	lifecycle: number;
	state: string[];
	listed: boolean;
	animated: boolean;
	owner: EmoteOwner;
	host: EmoteHost;
	tags?: string[];
}

export interface EmoteOwner {
	id: string;
	username: string;
	display_name: string;
	avatar_url?: string;
	roles?: string[];
}

export interface Style {
	color?: number;
}

export interface EmoteHost {
	url: string;
	files: EmoteFile[];
}

export interface EmoteFile {
	name: string;
	static_name: string;
	width: number;
	height: number;
	frame_count: number;
	size: number;
	format: string;
}

export interface ChannelOwner {
	id: string;
	username: string;
	display_name: string;
	avatar_url: string;
	roles: string[];
}
