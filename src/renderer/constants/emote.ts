export type EmoteProvider =
	| "kick-channel"
	| "kick-subscriber"
	| "kick-global"
	| "seventv-channel"
	| "seventv-global"
	| "seventv-personal"
	| "bttv-channel"
	| "bttv-shared"
	| "bttv-global"
	| "ffz-channel"
	| "ffz-global";

export type EmoteScope = "global" | "channel" | "subscriber" | "personal";

export type EmoteSizeKey = "1x" | "2x" | "3x" | "4x";

export interface EmoteUrls {
	"1x": string;
	"2x"?: string;
	"3x"?: string;
	"4x"?: string;
}

export interface EmoteEntry {
	id: string;
	name: string;
	provider: EmoteProvider;
	scope: EmoteScope;
	channelSlug?: string;
	animated: boolean;
	zeroWidth: boolean;
	width?: number;
	height?: number;
	urls: EmoteUrls;
	ownerName?: string;
	/** Composer'a yazilacak deger. Kick channel emoteleri icin [emote:ID:NAME]. */
	insertText: string;
	subscribersOnly?: boolean;
}

export interface EmoteSet {
	id?: string;
	provider: EmoteProvider;
	scope: EmoteScope;
	name: string;
	ownerName?: string;
	channelSlug?: string;
	emotes: EmoteEntry[];
}

export interface ChannelEmoteBundle {
	channelSlug: string;
	sets: EmoteSet[];
	loadedAt: number;
}

export const PROVIDER_LABEL: Record<EmoteProvider, string> = {
	"kick-channel": "Kick Channel",
	"kick-subscriber": "Kick Subscriber",
	"kick-global": "Kick Global",
	"seventv-channel": "7TV Channel",
	"seventv-global": "7TV Global",
	"seventv-personal": "7TV Personal",
	"bttv-channel": "BTTV Channel",
	"bttv-shared": "BTTV Shared",
	"bttv-global": "BTTV Global",
	"ffz-channel": "FFZ Channel",
	"ffz-global": "FFZ Global",
};
