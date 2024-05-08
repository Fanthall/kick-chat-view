export interface User {
	id: number;
	username: string;
	slug: string;
	identity?: {
		color: string;
		badges: { type: string; text: string; count?: number }[];
	};
}
export interface UserMessage {
	id: string;
	removed?: boolean;
	chatroom_id: number;
	content: string;
	type: string;
	created_at: string;
	sender: User;
	metadata?: {
		original_sender: {
			id: number;
			username: string;
		};
		original_message: {
			id: string;
			content: string;
		};
	};
}

export interface GiftSubMessage {
	chatroom_id: number;
	gifted_usernames: string[];
	gifter_username: string;
	create_at: number;
}

export interface SubMessage {
	chatroom_id: number;
	username: string;
	months: number;
	streak?: number;
	create_at: number;
}

export interface BanToMessage {
	id: string;
	user: User;
	banned_by: User;
	expires_at?: string;
}
export interface UnBanTOMessage {
	id: string;
	user: User;
	unbanned_by: User;
}
export interface DeleteMessage {
	id: string;
	message: {
		id: string;
		content?: string;
	};
}

export interface ModMessage {
	type: "ban" | "to" | "delete" | "unban";
	id: string;
	user?: User;
	created_at: number;
	//ban-to
	banned_by?: User;
	expires_at?: string;
	//unban
	unbanned_by?: User;
	//delete
	message?: {
		id?: string;
		messageList?: UserMessage[];
	};
}

export interface SubListItem {
	username: string;
	giftedList?: string[];
	months?: number;
	streak?: number;
	create_at: number;
}

export interface HostInfo {
	optional_message: string;
	number_viewers: number;
	host_username: string;
}
