/**
 * Sprint 14 — ModerationWindowShell
 *
 * Rendered when App.tsx detects hash `#/moderation-window`.
 * Bootstraps an isolated Redux store from the snapshot payload received via
 * the panel-window IPC bridge, then renders ModActionsModern in pop-out mode.
 *
 * Sync strategy: SNAPSHOT ONLY (Sprint 14).
 * - On mount, sends `panel-window:request-payload` to ask main renderer for
 *   a snapshot of the current Redux state.
 * - A "Refresh" button in the status bar re-requests the snapshot on demand.
 * - Live sync (real-time forwarding) is deferred to a future sprint.
 *
 * Note: Moderation actions (timeout, ban) still work in the pop-out because
 * they go directly through window.electron.kick.* IPC — they don't depend on
 * the local Redux store snapshot.
 */

import React, { FunctionComponent, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import type { PanelWindowPayload } from "../../../shared/panelWindow";
import chatMessageReducer from "../../store/reducer/chatMessage";
import {
	clearChannelState,
	modMessage,
	newMessage,
	setStreamMeta,
} from "../../store/actions/chatMessage";
import ModActionsModern from "./ModActionsModern";

// ─── Isolated Redux store for the pop-out ────────────────────────────────────

// Sprint 44: dev mode immutable/serializable warning yağmurunu kapatıyoruz.
const createPopOutStore = () =>
	configureStore({
		reducer: { messages: chatMessageReducer },
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: false,
				immutableCheck: false,
			}),
	});

// ─── Shell ────────────────────────────────────────────────────────────────────

const ModerationWindowShell: FunctionComponent = () => {
	const [store] = useState(createPopOutStore);
	const [snapshotAt, setSnapshotAt] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [roleInfo, setRoleInfo] = useState({ isOwner: false, isMod: false });
	const [channelSlug, setChannelSlug] = useState<string | undefined>(undefined);
	const [selectedModUser, setSelectedModUser] = useState<
		import("../../util/chatInterface").User | undefined
	>(undefined);

	// Subscribe to incoming snapshot payloads from main renderer.
	useEffect(() => {
		const unsub = window.electron?.panelWindow?.onPayload(
			(payload: PanelWindowPayload) => {
				if (payload.panel !== "moderation") return;

				// Replace store contents with snapshot:
				store.dispatch(clearChannelState());

				const slug = payload.channelSlug;
				setChannelSlug(slug);

				// Populate mod actions.
				if (payload.modAction) {
					payload.modAction.forEach((item) => {
						store.dispatch(modMessage(item) as any);
					});
				}

				// Populate message list (for msg-count display).
				if (payload.messageList) {
					payload.messageList.forEach((item) => {
						store.dispatch(newMessage(item) as any);
					});
				}

				// Seed stream meta so ModActionsModern can look up broadcasterUserId.
				if (slug) {
					// Minimal stub — broadcaster user id unknown from snapshot alone.
					// Future sprint can include streamMetaByChannel in payload.
					store.dispatch(
						setStreamMeta({
							channelSlug: slug,
							isLive: false,
							broadcasterUserId: undefined,
							updatedAt: Date.now(),
						}) as any
					);
				}

				// Role info forwarded from main renderer.
				if (payload.roleInfo) {
					setRoleInfo(payload.roleInfo);
				}

				// Sprint 17: explicit moderation target forwarded from main.
				setSelectedModUser(payload.selectedModUser);

				// Sprint 17: pop-out has its own localStorage. Hydrate the
				// suspended-users + blocked-emotes lists from the main snapshot
				// so the existing getSuspendedUsers()/getBlockedEmotes() reads
				// inside ModActionsModern keep working unchanged. Fires the
				// LOCAL_MODERATION_SETTINGS_CHANGED event so any open ModActions
				// rerenders against the fresh values.
				try {
					if (payload.suspendedUsers) {
						localStorage.setItem(
							"susUsers",
							JSON.stringify(payload.suspendedUsers)
						);
					}
					if (payload.blockedEmotes) {
						localStorage.setItem(
							"blockEmotes",
							JSON.stringify(payload.blockedEmotes)
						);
					}
					window.dispatchEvent(
						new Event("local-moderation-settings-changed")
					);
				} catch {
					/* ignore quota / serialization errors in pop-out */
				}

				setSnapshotAt(payload.snapshotAt);
				setLoading(false);
			}
		);
		return () => unsub?.();
	}, [store]);

	// Request initial snapshot on mount.
	useEffect(() => {
		window.electron?.panelWindow?.requestPayload("moderation");
		const timer = setTimeout(() => setLoading(false), 3000);
		return () => clearTimeout(timer);
	}, []);

	const handleRefresh = () => {
		setLoading(true);
		window.electron?.panelWindow?.requestPayload("moderation");
		setTimeout(() => setLoading(false), 3000);
	};

	return (
		<Provider store={store}>
			<div
				data-app-shell="modern"
				style={{
					width: "100%",
					height: "100vh",
					display: "flex",
					flexDirection: "column",
					background: "var(--ms-bg-1, #121212)",
					color: "var(--ms-fg-1, #e8e8e8)",
				}}
			>
				{loading ? (
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--ms-fg-3)",
							fontSize: 13,
						}}
					>
						Loading moderation snapshot…
					</div>
				) : (
					<div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
						<ModActionsModern
							isOwner={roleInfo.isOwner}
							isMod={roleInfo.isMod}
							selectedUser={selectedModUser}
							onClearSelected={() => setSelectedModUser(undefined)}
							isPopOut
						/>
					</div>
				)}

				{/* Status bar */}
				{snapshotAt !== null && (
					<div
						style={{
							padding: "4px 12px",
							fontSize: 10,
							color: "var(--ms-fg-4, #666)",
							borderTop: "1px solid var(--ms-bd-1, #2a2a2a)",
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexShrink: 0,
						}}
					>
						<span>
							Snapshot {new Date(snapshotAt).toLocaleTimeString()} · static view
						</span>
						<button
							onClick={handleRefresh}
							style={{
								background: "none",
								border: "1px solid var(--ms-bd-2, #333)",
								borderRadius: 4,
								color: "var(--ms-fg-3, #888)",
								fontSize: 10,
								padding: "2px 6px",
								cursor: "pointer",
							}}
							type="button"
						>
							Refresh
						</button>
					</div>
				)}
				<ToastContainer autoClose={4500} closeOnClick pauseOnHover />
			</div>
		</Provider>
	);
};

export default ModerationWindowShell;
