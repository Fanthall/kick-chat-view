import { AxiosResponse } from "axios";
import { ChannelEmotes } from "../constants/seventv";
import { makeRequest } from "./makeRequest";

const SEVENTV_BASE = "https://7tv.io/v3";

const SEVENTV_GLOBAL_SET_ID = "global";

/**
 * Legacy yardimci - hardcoded set. Eski kod (App.tsx) hala bunu cagiriyor.
 * Yeni akista kullanmak yerine `getSevenTvGlobalSet()` ve `getSevenTvKickUser()` tercih edilmeli.
 */
export const getEmote = (): Promise<AxiosResponse<ChannelEmotes>> => {
	return makeRequest<ChannelEmotes>({
		url: `${SEVENTV_BASE}/emote-sets/619bd9f7eecae7a725bc7570?id=603caf09c20d020014423c14`,
		method: "GET",
	});
};

export const getSevenTvGlobalSet = (): Promise<AxiosResponse<ChannelEmotes>> => {
	return makeRequest<ChannelEmotes>({
		url: `${SEVENTV_BASE}/emote-sets/${SEVENTV_GLOBAL_SET_ID}`,
		method: "GET",
	});
};

export const getSevenTvEmoteSet = (
	setId: string
): Promise<AxiosResponse<ChannelEmotes>> => {
	return makeRequest<ChannelEmotes>({
		url: `${SEVENTV_BASE}/emote-sets/${encodeURIComponent(setId)}`,
		method: "GET",
	});
};

export interface SevenTvUserConnection {
	id: string;
	platform: string;
	username: string;
	display_name?: string;
	emote_capacity?: number;
	emote_set_id?: string;
	emote_set?: ChannelEmotes | null;
}

export interface SevenTvKickUserResponse {
	id?: string;
	platform?: string;
	username?: string;
	display_name?: string;
	emote_capacity?: number;
	emote_set_id?: string | null;
	emote_set?: ChannelEmotes | null;
	user?: {
		id?: string;
		username?: string;
		display_name?: string;
		avatar_url?: string;
		connections?: SevenTvUserConnection[];
		emote_sets?: ChannelEmotes[];
	};
}

/**
 * Kick kullanicisi icin 7TV baglantisini cozer.
 * - `/v3/users/kick/{kick_user_id}` cevabi `emote_set` veya
 *   `user.connections[platform=KICK].emote_set` icerebilir.
 * - 404 -> kullanicinin 7TV bagi yoktur, sadece global set kullanilir.
 */
export const getSevenTvKickUser = (
	kickUserId: string | number
): Promise<AxiosResponse<SevenTvKickUserResponse>> => {
	return makeRequest<SevenTvKickUserResponse>({
		url: `${SEVENTV_BASE}/users/kick/${encodeURIComponent(String(kickUserId))}`,
		method: "GET",
	});
};
