/**
 * Sprint 14 — PanelWindow shared types.
 *
 * Payload relayed from the main renderer to the panel pop-out window.
 * Sprint 14 ships snapshot-only sync: the pop-out gets a point-in-time
 * snapshot of the relevant Redux slice when the window is opened, and
 * optionally when the user clicks "Refresh". Live-sync is deferred.
 */

import type { ActivityItem, ModMessage, UserMessage } from "../renderer/util/chatInterface";

/** Which panel is rendered in the pop-out. */
export type PanelKind = "activity" | "moderation";

/** Role info forwarded to the moderation pop-out. */
export interface PanelRoleInfo {
	isOwner: boolean;
	isMod: boolean;
}

/**
 * Snapshot payload sent from main renderer → main process → pop-out renderer.
 *
 * Sprint 14 limitation: snapshot only. The pop-out is a static view of the
 * Redux state at send-time. A "Refresh" button in the pop-out re-requests
 * the snapshot via the `panel-window:request-payload` IPC channel.
 */
export interface PanelWindowPayload {
	/** Disambiguates which panel to render. */
	panel: PanelKind;

	/** The active channel slug at the time of snapshot. */
	channelSlug?: string;

	/** Snapshot of activity list (for "activity" panel). */
	activityList?: ActivityItem[];

	/** Snapshot of mod actions (for "moderation" panel). */
	modAction?: ModMessage[];

	/** Snapshot of message list (used for user msg-count in moderation). */
	messageList?: UserMessage[];

	/** Role info for moderation panel. */
	roleInfo?: PanelRoleInfo;

	/** ISO timestamp of when the snapshot was taken. */
	snapshotAt: number;
}
