import { AxiosResponse } from "axios";
import { FfzRoomResponse, FfzSetsResponse } from "../constants/ffz";
import { makeRequest } from "./makeRequest";

const FFZ_BASE = "https://api.frankerfacez.com/v1";

export const getFfzGlobalSets = (): Promise<AxiosResponse<FfzSetsResponse>> => {
	return makeRequest<FfzSetsResponse>({
		url: `${FFZ_BASE}/set/global`,
		method: "GET",
	});
};

export const getFfzRoomByTwitchId = (
	twitchId: string | number
): Promise<AxiosResponse<FfzRoomResponse>> => {
	return makeRequest<FfzRoomResponse>({
		url: `${FFZ_BASE}/room/id/${encodeURIComponent(String(twitchId))}`,
		method: "GET",
	});
};
