import { AxiosResponse } from "axios";
import { KickEmoteGroup } from "../constants/kickEmotes";
import { makeRequest } from "./makeRequest";

/**
 * Kick kanal emote endpoint'i. Cevap genelde 3 grup donduruyor:
 *   [{ name: "Global", emotes: [...] }, { name: "Emojis", emotes: [...] },
 *    { id: <channel_id>, name: <channel_slug>, emotes: [...] }]
 */
export const getKickChannelEmotes = (
	slug: string
): Promise<AxiosResponse<KickEmoteGroup[]>> => {
	return makeRequest<KickEmoteGroup[]>({
		url: `https://kick.com/emotes/${encodeURIComponent(slug)}`,
		method: "GET",
	});
};
