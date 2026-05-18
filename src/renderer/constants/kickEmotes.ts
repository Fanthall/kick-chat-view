export interface KickApiEmote {
	id: number;
	name: string;
	subscribers_only?: boolean;
	channel_id?: number | null;
}

/**
 * Kick `/emotes/{slug}` endpoint genelde 3 grup donduruyor:
 *   - Global  (`name: "Global"`)
 *   - Emojis  (yerlesik emoji seti; bazen `name: "Emojis"`)
 *   - Channel (kanal adi; abone emote bilgisini her bir emote item'inde tasir)
 */
export interface KickEmoteGroup {
	id?: number | string;
	name: string;
	emotes: KickApiEmote[];
	user_id?: number;
	subscriber_badges?: unknown[];
	channel?: {
		id?: number;
		slug?: string;
		user?: { username?: string };
	};
}
