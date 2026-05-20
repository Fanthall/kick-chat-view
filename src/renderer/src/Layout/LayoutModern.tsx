/**
 * Sprint 2 — Modern Layout Shell (Design v1 § 3-col + topbar).
 *
 * Bu component yalnizca `[data-app-shell="modern"]` scope altinda render olur ve
 * App.tsx tarafindan opt-in flag (`?shell=modern` URL param VEYA
 * `localStorage.chatViewShellPreview === "modern"`) ile etkinlestirilir.
 * Classic Layout default kalir (Karar 1: UI-mode runtime toggle REJECTED — bu
 * sadece developer preview flag, kullaniciya runtime-switcher YOK).
 *
 * Sprint 2 scope:
 * - Topbar (kanal avatar + LIVE pill + kanal tabs + stat row + role badge + icon-only aksiyon)
 * - 3-column stage iskeleti (Chat / Activity / Moderation panel placeholder'lari)
 *
 * Asagidaki sprintlerde (3 Settings IA, 4 Activity Drawer, 5 Emote, 6 Density, 7 a11y)
 * her panel ic icerik mevcut classic component'lara delege edilir veya yeni
 * component'larla doldurulur. Bu shell HIC bir mevcut classic logic'i degistirmez.
 */

import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import {
	ChatViewChannel,
	getActiveChannelSlug,
	getChannelList,
	setActiveChannelSlug,
} from "../../util/channelSettings";
import { chatListener } from "../../util/chatConnection";
import Icon from "../Component/Icon/Icon";
import ChatModern from "../Chat/ChatModern";
import ActivityView from "../ActivityView/ActivityView";
import ModActions from "../ModActions/ModActions";

const SHELL_ATTR = "modern";

const formatUptime = (startedAtIso?: string): string => {
	if (!startedAtIso) return "";
	const start = new Date(startedAtIso).getTime();
	if (!Number.isFinite(start)) return "";
	const ms = Date.now() - start;
	if (ms <= 0) return "0d";
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	if (h > 0) return `${h}sa ${m}dk`;
	return `${m}dk`;
};

const LayoutModern: FunctionComponent = () => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [channels, setChannels] = useState<ChatViewChannel[]>(() =>
		getChannelList()
	);
	const [activeSlug, setActiveSlug] = useState<string>(
		() => getActiveChannelSlug() || ""
	);

	const streamMeta = activeSlug
		? messages.streamMetaByChannel[activeSlug]
		: undefined;
	const isLive = !!streamMeta?.isLive;
	const viewerCount = streamMeta?.viewerCount;
	const categoryName = streamMeta?.category?.name;
	const uptime = useMemo(
		() => formatUptime(streamMeta?.startedAt),
		[streamMeta?.startedAt, streamMeta?.updatedAt]
	);

	useEffect(() => {
		const onSettings = () => {
			setChannels(getChannelList());
			setActiveSlug(getActiveChannelSlug() || "");
		};
		window.addEventListener("kick-channel-settings-changed", onSettings);
		return () => {
			window.removeEventListener(
				"kick-channel-settings-changed",
				onSettings
			);
		};
	}, []);

	const onSelectChannel = (slug: string) => {
		if (!slug || slug === activeSlug) return;
		setActiveChannelSlug(slug);
		setActiveSlug(slug);
		dispatch(chatListener(slug));
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
	};

	return (
		<div
			data-app-shell={SHELL_ATTR}
			style={{
				display: "grid",
				gridTemplateRows: "auto 1fr",
				height: "100%",
				width: "100%",
				background: "var(--ms-bg-0)",
			}}
		>
			{/* Topbar */}
			<header className="ms-topbar" role="banner">
				<div className="ms-topbar-avatar" aria-hidden="true" />
				<div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
					<strong
						style={{
							fontSize: "var(--ms-fs-14)",
							color: "var(--ms-fg-1)",
						}}
					>
						{activeSlug || "Kanal secilmedi"}
					</strong>
					{streamMeta?.streamTitle && (
						<span
							style={{
								fontSize: "var(--ms-fs-12)",
								color: "var(--ms-fg-3)",
								maxWidth: 280,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
							title={streamMeta.streamTitle}
						>
							{streamMeta.streamTitle}
						</span>
					)}
				</div>

				{isLive && (
					<span
						className="ms-live-pill"
						role="status"
						aria-label="Yayin canli"
					>
						AKTIF
					</span>
				)}

				{/* Multi-channel tabs */}
				{channels.length > 0 && (
					<div
						role="tablist"
						aria-label="Kanal sekmeleri"
						style={{ display: "flex", gap: "var(--ms-sp-1)" }}
					>
						{channels.map((c) => (
							<button
								key={c.slug}
								role="tab"
								aria-selected={c.slug === activeSlug}
								className={`ms-tab ${
									c.slug === activeSlug ? "ms-tab-active" : ""
								}`}
								onClick={() => onSelectChannel(c.slug)}
							>
								{c.slug}
							</button>
						))}
					</div>
				)}

				<div className="ms-spacer-flex" />

				{/* Stat row */}
				<div className="ms-stat-row" aria-label="Yayin istatistikleri">
					{viewerCount !== undefined && (
						<span className="ms-stat" title="Izleyici">
							<Icon name="user" size={14} />
							<span className="ms-mono">{viewerCount}</span>
						</span>
					)}
					{uptime && (
						<span className="ms-stat" title="Yayin suresi">
							<Icon name="bolt" size={14} />
							<span className="ms-mono">{uptime}</span>
						</span>
					)}
					{categoryName && (
						<span className="ms-stat" title="Kategori">
							<Icon name="pin" size={14} />
							<span>{categoryName}</span>
						</span>
					)}
				</div>

				{/* Role badges (placeholder — Sprint 3 Permissions section'a baglanir) */}
				<span className="ms-role-badge">
					<Icon name="shield" size={12} />
					Viewer
				</span>

				{/* Icon-only action row */}
				<button
					className="ms-icon-btn"
					aria-label="Ayarlar"
					title="Ayarlar"
					type="button"
				>
					<Icon name="settings" size={16} />
				</button>
				<button
					className="ms-icon-btn"
					aria-label="Kanal ekle"
					title="Kanal ekle"
					type="button"
				>
					<Icon name="plus" size={16} />
				</button>
			</header>

			{/* 3-col stage */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(0,1fr) 340px 340px",
					gap: "var(--ms-sp-2)",
					padding: "var(--ms-sp-2)",
					overflow: "hidden",
				}}
			>
				<section
					style={{
						background: "var(--ms-bg-1)",
						borderRadius: "var(--ms-r-3)",
						overflow: "hidden",
						minWidth: 0,
					}}
					aria-label="Chat"
				>
					<ChatModern />
				</section>
				<aside
					style={{
						background: "var(--ms-bg-1)",
						borderRadius: "var(--ms-r-3)",
						overflow: "hidden",
					}}
					aria-label="Aktivite"
				>
					<ActivityView />
				</aside>
				<aside
					style={{
						background: "var(--ms-bg-1)",
						borderRadius: "var(--ms-r-3)",
						overflow: "hidden",
					}}
					aria-label="Moderasyon"
				>
					<ModActions />
				</aside>
			</div>
		</div>
	);
};

export default LayoutModern;
