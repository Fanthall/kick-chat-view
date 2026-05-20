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
import type { PanelWindowPayload } from "../shared/panelWindow";

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
		/**
		 * Sprint 16 fix: explicit "ready" signal from the popup once the React
		 * subscriber is attached. Solves the race where did-finish-load fired
		 * before useEffect could register the onPayload listener (payload was
		 * lost). Main responds by re-sending the stored payload.
		 */
		requestPayload(): void {
			ipcRenderer.send("user-window:ready");
		},
	},
	kickConnectionWindow: {
		open(): Promise<void> {
			return ipcRenderer.invoke("kick-connection-window:open");
		},
	},
	panelWindow: {
		open(panel: "activity" | "moderation"): Promise<void> {
			return ipcRenderer.invoke("panel-window:open", panel);
		},
		sendPayload(payload: PanelWindowPayload): Promise<void> {
			return ipcRenderer.invoke("panel-window:send-payload", payload);
		},
		/** Called by pop-out renderer to request a fresh snapshot from main renderer. */
		requestPayload(panel: "activity" | "moderation"): void {
			ipcRenderer.send("panel-window:request-payload", panel);
		},
		/** Pop-out renderer subscribes to incoming snapshot payloads. */
		onPayload(func: (payload: PanelWindowPayload) => void) {
			const subscription = (
				_event: IpcRendererEvent,
				payload: PanelWindowPayload
			) => func(payload);
			ipcRenderer.on("panel-window:payload", subscription);
			return () => {
				ipcRenderer.removeListener("panel-window:payload", subscription);
			};
		},
		/** Main renderer subscribes to refresh requests from pop-out. */
		onRefreshRequest(func: (panel: "activity" | "moderation") => void) {
			const subscription = (
				_event: IpcRendererEvent,
				panel: "activity" | "moderation"
			) => func(panel);
			ipcRenderer.on("panel-window:refresh-request", subscription);
			return () => {
				ipcRenderer.removeListener("panel-window:refresh-request", subscription);
			};
		},
		/**
		 * Sprint 37: main renderer subscribes to "mod target cleared" events
		 * forwarded from any pop-out window — keeps the local selection state
		 * in sync when the X button is pressed in the pop-out.
		 */
		onModTargetCleared(func: () => void) {
			const subscription = () => func();
			ipcRenderer.on("panel-window:mod-target-cleared", subscription);
			return () => {
				ipcRenderer.removeListener(
					"panel-window:mod-target-cleared",
					subscription
				);
			};
		},
	},
	/**
	 * Sprint 40: webhook receiver bridge.
	 * Public URL kullanıcının tünelinden gelir (ngrok / cloudflare-tunnel);
	 * bu local receiver yalnız main process'in açtığı HTTP server'a IPC
	 * pencere oluyor.
	 */
	webhook: {
		getReceiverInfo(): Promise<{ port: number; path: string; localUrl: string }> {
			return ipcRenderer.invoke("webhook:get-receiver-info");
		},
		isRunning(): Promise<boolean> {
			return ipcRenderer.invoke("webhook:is-running");
		},
		start(port?: number): Promise<{ ok: boolean; port: number }> {
			return ipcRenderer.invoke("webhook:start", port);
		},
		stop(): Promise<{ ok: boolean }> {
			return ipcRenderer.invoke("webhook:stop");
		},
		onEvent(
			func: (event: {
				eventType: string;
				messageId: string;
				subscriptionId?: string;
				timestamp: string;
				payload: unknown;
				verified: boolean;
			}) => void
		) {
			const subscription = (_e: IpcRendererEvent, payload: any) => func(payload);
			ipcRenderer.on("webhook:event", subscription);
			return () => {
				ipcRenderer.removeListener("webhook:event", subscription);
			};
		},
	},
};

contextBridge.exposeInMainWorld("electron", electronHandler);

export type ElectronHandler = typeof electronHandler;
