import { AxiosResponse } from "axios";
import { ChannelEmotes } from "../constants/seventv";
import { makeRequest } from "./makeRequest";

export const getEmote = (): Promise<AxiosResponse<ChannelEmotes>> => {
	return makeRequest<ChannelEmotes>({
		url: "https://7tv.io/v3/emote-sets/619bd9f7eecae7a725bc7570?id=603caf09c20d020014423c14",
		method: "GET",
	});
};
