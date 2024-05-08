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

export const getToken = () => {
	makeRequest({
		url: "https://kick.com/kick-token-provider",

		method: "GET",
	})
		.then((res: any) => {
			console.log(res.data);
			const nameField = res.data.nameFieldName;
			makeRequest({
				url: "https://kick.com/login",
				method: "POST",
				headers: {},
				data: {
					email: "Fanthal",
					password: "qc*99<2>z*m5tK(",
					[nameField]: "",
					_kick_token_valid_from: res.data.encryptedValidFrom,
				},
			})
				.then((loginRes: any) => {
					console.log(loginRes.data);
				})
				.catch((loginErr) => {
					console.log(loginErr);
				});
		})
		.catch((err) => {
			console.log(err);
		});
};
