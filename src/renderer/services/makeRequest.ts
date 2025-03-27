import axios, { AxiosRequestConfig } from "axios";

export function makeRequest<T>(config: AxiosRequestConfig) {
	return axios.request<T>(config);
}
