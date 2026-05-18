// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

import type {
	KickApiResponse,
	KickAuthStatus,
	KickCategory,
	KickChannel,
	KickChannelReward,
	KickConnectRequest,
	KickEventSubscriptionRequest,
	KickKicksLeaderboard,
	KickModerationBanRequest,
	KickModerationUnbanRequest,
	KickPatchChannelRequest,
	KickRewardRedemption,
	KickRewardRedemptionsQuery,
	KickSendChatMessageRequest,
} from "./kickService";
import type { UserWindowPayload } from "../shared/userWindow";

export type Channels = "ipc-example";

const electronHandler = {
	ipcRenderer: {
		sendMessage(channel: Channels, ...args: unknown[]) {
			ipcRenderer.send(channel, ...args);
		},
		on(channel: Channels, func: (...args: unknown[]) => void) {
			const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
				func(...args);
			ipcRenderer.on(channel, subscription);

			return () => {
				ipcRenderer.removeListener(channel, subscription);
			};
		},
		once(channel: Channels, func: (...args: unknown[]) => void) {
			ipcRenderer.once(channel, (_event, ...args) => func(...args));
		},
	},
	kick: {
		getAuthStatus(): Promise<KickAuthStatus> {
			return ipcRenderer.invoke("kick:get-auth-status");
		},
		getStoredConfig(): Promise<KickConnectRequest> {
			return ipcRenderer.invoke("kick:get-stored-config");
		},
		connect(request: KickConnectRequest): Promise<KickAuthStatus> {
			return ipcRenderer.invoke("kick:connect", request);
		},
		disconnect(): Promise<KickAuthStatus> {
			return ipcRenderer.invoke("kick:disconnect");
		},
		refresh(): Promise<KickAuthStatus> {
			return ipcRenderer.invoke("kick:refresh");
		},
		getChannelBySlug(slug: string) {
			return ipcRenderer.invoke("kick:get-channel-by-slug", slug);
		},
		patchChannel(
			request: KickPatchChannelRequest
		): Promise<KickApiResponse<KickChannel>> {
			return ipcRenderer.invoke("kick:patch-channel", request);
		},
		searchCategories(
			query: string,
			limit?: number
		): Promise<KickApiResponse<KickCategory[]>> {
			return ipcRenderer.invoke("kick:search-categories", query, limit);
		},
		getCategoryById(id: number): Promise<KickApiResponse<KickCategory>> {
			return ipcRenderer.invoke("kick:get-category-by-id", id);
		},
		getOwnChannels() {
			return ipcRenderer.invoke("kick:get-own-channels");
		},
		getUsers(ids?: number[]) {
			return ipcRenderer.invoke("kick:get-users", ids);
		},
		getLivestreams(broadcasterUserIds?: number[]) {
			return ipcRenderer.invoke("kick:get-livestreams", broadcasterUserIds);
		},
		sendChatMessage(request: KickSendChatMessageRequest) {
			return ipcRenderer.invoke("kick:send-chat-message", request);
		},
		deleteChatMessage(messageId: string): Promise<void> {
			return ipcRenderer.invoke("kick:delete-chat-message", messageId);
		},
		banUser(request: KickModerationBanRequest) {
			return ipcRenderer.invoke("kick:ban-user", request);
		},
		timeoutUser(request: KickModerationBanRequest) {
			return ipcRenderer.invoke("kick:timeout-user", request);
		},
		unbanUser(request: KickModerationUnbanRequest) {
			return ipcRenderer.invoke("kick:unban-user", request);
		},
		listEventSubscriptions(broadcasterUserId?: number) {
			return ipcRenderer.invoke(
				"kick:list-event-subscriptions",
				broadcasterUserId
			);
		},
		subscribeToEvents(request: KickEventSubscriptionRequest) {
			return ipcRenderer.invoke("kick:subscribe-to-events", request);
		},
		deleteEventSubscriptions(ids: string[]): Promise<void> {
			return ipcRenderer.invoke("kick:delete-event-subscriptions", ids);
		},
		getChannelRewards(): Promise<KickApiResponse<KickChannelReward[]>> {
			return ipcRenderer.invoke("kick:get-channel-rewards");
		},
		getChannelRewardRedemptions(
			request?: KickRewardRedemptionsQuery
		): Promise<
			KickApiResponse<KickRewardRedemption[]> & {
				pagination?: { cursor?: string };
			}
		> {
			return ipcRenderer.invoke("kick:get-channel-reward-redemptions", request);
		},
		acceptChannelRewardRedemptions(ids: string[]) {
			return ipcRenderer.invoke("kick:accept-channel-reward-redemptions", ids);
		},
		rejectChannelRewardRedemptions(ids: string[]) {
			return ipcRenderer.invoke("kick:reject-channel-reward-redemptions", ids);
		},
		getKicksLeaderboard(
			top?: number
		): Promise<KickApiResponse<KickKicksLeaderboard>> {
			return ipcRenderer.invoke("kick:get-kicks-leaderboard", top);
		},
	},
	userWindow: {
		open(payload: UserWindowPayload): Promise<void> {
			return ipcRenderer.invoke("user-window:open", payload);
		},
		update(payload: UserWindowPayload): Promise<void> {
			return ipcRenderer.invoke("user-window:update", payload);
		},
		close(key: string): Promise<void> {
			return ipcRenderer.invoke("user-window:close", key);
		},
		onPayload(func: (payload: UserWindowPayload) => void) {
			const subscription = (
				_event: IpcRendererEvent,
				payload: UserWindowPayload
			) => func(payload);
			ipcRenderer.on("user-window:payload", subscription);

			return () => {
				ipcRenderer.removeListener("user-window:payload", subscription);
			};
		},
	},
	kickConnectionWindow: {
		open(): Promise<void> {
			return ipcRenderer.invoke("kick-connection-window:open");
		},
	},
};

contextBridge.exposeInMainWorld("electron", electronHandler);

export type ElectronHandler = typeof electronHandler;
