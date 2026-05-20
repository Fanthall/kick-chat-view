/**
 * Sprint 14 — ActivityWindowShell
 *
 * Rendered when App.tsx detects hash `#/activity-window`.
 * Bootstraps an isolated Redux store from the snapshot payload received via
 * the panel-window IPC bridge, then renders ActivityViewModern in pop-out mode.
 *
 * Sync strategy: SNAPSHOT ONLY (Sprint 14).
 * - On mount, sends `panel-window:request-payload` to ask main renderer for
 *   a snapshot of the current Redux state.
 * - A "Refresh" button in the status bar re-requests the snapshot on demand.
 * - Live sync (real-time forwarding) is deferred to a future sprint.
 */

import React, { FunctionComponent, useEffect, useState } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import type { PanelWindowPayload } from "../../../shared/panelWindow";
import chatMessageReducer from "../../store/reducer/chatMessage";
import {
	addActivity,
	clearChannelState,
} from "../../store/actions/chatMessage";
import ActivityViewModern from "./ActivityViewModern";

// ─── Isolated Redux store for the pop-out ────────────────────────────────────

const createPopOutStore = () =>
	configureStore({
		reducer: { messages: chatMessageReducer },
	});

// ─── Shell ────────────────────────────────────────────────────────────────────

const ActivityWindowShell: FunctionComponent = () => {
	const [store] = useState(createPopOutStore);
	const [snapshotAt, setSnapshotAt] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);

	// Subscribe to incoming snapshot payloads from main renderer.
	useEffect(() => {
		const unsub = window.electron?.panelWindow?.onPayload(
			(payload: PanelWindowPayload) => {
				if (payload.panel !== "activity") return;

				// Replace activity list in the isolated store:
				// clear first, then batch-add snapshot items.
				store.dispatch(clearChannelState());
				if (payload.activityList) {
					payload.activityList.forEach((item) => {
						store.dispatch(addActivity(item) as any);
					});
				}
				setSnapshotAt(payload.snapshotAt);
				setLoading(false);
			}
		);
		return () => unsub?.();
	}, [store]);

	// Request initial snapshot on mount.
	useEffect(() => {
		window.electron?.panelWindow?.requestPayload("activity");
		const timer = setTimeout(() => setLoading(false), 3000);
		return () => clearTimeout(timer);
	}, []);

	const handleRefresh = () => {
		setLoading(true);
		window.electron?.panelWindow?.requestPayload("activity");
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
						Loading activity snapshot…
					</div>
				) : (
					<div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
						<ActivityViewModern isPopOut />
					</div>
				)}

				{/* Status bar with snapshot time and refresh button */}
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

export default ActivityWindowShell;
