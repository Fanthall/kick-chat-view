import { AxiosResponse } from "axios";
import { ChannelData } from "../constants/kick";
import { makeRequest } from "./makeRequest";

export const getChannelData = (
	channelName: string
): Promise<AxiosResponse<ChannelData>> => {
	return makeRequest<ChannelData>({
		url: "https://kick.com/api/v2/channels/" + channelName,
		method: "GET",
	});
};
