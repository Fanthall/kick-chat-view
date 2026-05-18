import { AxiosResponse } from "axios";
import { ChannelData } from "../constants/kick";
import { UserMessage } from "../util/chatInterface";
import { makeRequest } from "./makeRequest";

interface ChannelMessagesResponse {
	status: {
		error: boolean;
		code: number;
		message: string;
	};
	data: {
		messages: UserMessage[];
		cursor?: string;
		pinned_message?: UserMessage | null;
	};
}

export const getChannelData = (
	channelName: string
): Promise<AxiosResponse<ChannelData>> => {
	return makeRequest<ChannelData>({
		url: "https://kick.com/api/v2/channels/" + channelName,
		method: "GET",
	});
};

export const getChannelMessages = (
	channelId: number
): Promise<AxiosResponse<ChannelMessagesResponse>> => {
	return makeRequest<ChannelMessagesResponse>({
		url: `https://kick.com/api/v2/channels/${channelId}/messages`,
		method: "GET",
	});
};
