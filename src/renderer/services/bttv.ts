import { AxiosResponse } from "axios";
import { BttvEmote, BttvUserResponse } from "../constants/bttv";
import { makeRequest } from "./makeRequest";

const BTTV_BASE = "https://api.betterttv.net/3/cached";

export const getBttvGlobalEmotes = (): Promise<AxiosResponse<BttvEmote[]>> => {
	return makeRequest<BttvEmote[]>({
		url: `${BTTV_BASE}/emotes/global`,
		method: "GET",
	});
};

export const getBttvTwitchUser = (
	twitchId: string | number
): Promise<AxiosResponse<BttvUserResponse>> => {
	return makeRequest<BttvUserResponse>({
		url: `${BTTV_BASE}/users/twitch/${encodeURIComponent(String(twitchId))}`,
		method: "GET",
	});
};
