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
	channelSlug?: string;
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
	id?: string;
	channelSlug?: string;
	chatroom_id: number;
	gifted_usernames: string[];
	gifter_username: string;
	create_at: number;
	// WI-1.5 webhook bridge: legacy Pusher payload normalize edilirken doldurulan opsiyonel
	// alanlar (CONSTRAINT-3 backward compat — eski payload tuketici varsa zarar gormez).
	eventType?: string;
	expiresAt?: number;
	anonymous?: boolean;
}

export interface SubMessage {
	id?: string;
	channelSlug?: string;
	chatroom_id: number;
	username: string;
	months: number;
	streak?: number;
	create_at: number;
	// WI-1.5 webhook bridge: optional enrichment fields.
	eventType?: string;
	expiresAt?: number;
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
	channelSlug?: string;
	status?: "pending" | "success" | "failed";
	error?: string;
	reason?: string;
	user?: User;
	created_at: number;
	//ban-to
	banned_by?: User;
	expires_at?: string;
	//unban
	unbanned_by?: User;
	//delete
	message?: ModUserHistory;
}

export interface ModUserHistory {
	id?: string;
	messageList?: UserMessage[];
}

export type ActivityKind =
	| "subscription_new"
	| "subscription_renewal"
	| "subscription_gift"
	| "reward_redemption"
	| "kicks_gifted"
	| "host_raid"
	| "follow";

export type ActivityStatus = "pending" | "accepted" | "rejected";

export interface ActivityUser {
	id?: number;
	username: string;
	slug?: string;
	profilePicture?: string;
}

export interface ActivityItem {
	id?: string;
	channelSlug?: string;
	kind: ActivityKind;
	actor: ActivityUser;
	targetUsers?: ActivityUser[];
	amount?: number;
	title?: string;
	message?: string;
	status?: ActivityStatus;
	createdAt: number;
	raw?: unknown;
	// Webhook eventType (e.g. "channel.subscription.new", "kicks.gifted") — REQ-3/5
	eventType?: string;
	// Subscription expiry timestamp (epoch ms) — REQ-3
	expiresAt?: number;
	// Anonymous gifter marker — REQ-4
	anonymous?: boolean;
	// KICKs gift metadata — REQ-5
	giftName?: string;
	giftType?: string;
	giftTier?: number | string;
	pinnedTimeSeconds?: number;
	// Legacy subscription fields kept for old Pusher payload compatibility.
	username?: string;
	giftedList?: string[];
	months?: number;
	streak?: number;
	create_at: number;
}

export type SubListItem = ActivityItem;

export interface HostInfo {
	channelSlug?: string;
	optional_message: string;
	number_viewers: number;
	host_username: string;
}
