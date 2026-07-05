/**
 * Sprint 6b — EmotePickerModern
 *
 * Modal emote picker with tabs, search, grid, preview pane, and provider
 * status footer.  Mirrors Designs/emote-picker.jsx structure.
 *
 * CONSTRAINT-4: no dangerouslySetInnerHTML — emote images rendered via <img>.
 * CONSTRAINT-5: Kick provider precedence preserved — searchEmotes handles it.
 * Classic EmotePicker.tsx is NOT modified.
 */

import React, {
	FunctionComponent,
	KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuRefreshCw, LuSearch, LuSmile, LuStar, LuX } from "react-icons/lu";
import { useFocusTrap } from "../../util/useFocusTrap";
import {
	EmoteEntry,
	EmoteProvider,
	EmoteSet,
	PROVIDER_LABEL,
} from "../../constants/emote";
import { EmoteIndex, searchEmotes } from "../../util/emoteIndex";
import {
	FAVORITES_CHANGED_EVENT,
	FavoriteEmoteRef,
	getFavoriteEmotes,
	isFavoriteEmote,
	toggleFavoriteEmote,
} from "../../util/emoteFavorites";
import { useTranslation } from "../../util/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EpTabKey = "favorites" | "kick" | "seventv" | "bttv" | "ffz" | "emoji";

export interface EmotePickerModernProps {
	open: boolean;
	onClose: () => void;
	index: EmoteIndex;
	onPick: (entry: EmoteEntry, options: { keepOpen: boolean }) => void;
	onRefresh?: (tab?: EpTabKey) => void;
	anchorRef?: React.RefObject<HTMLElement>;
	/**
	 * Faz 7: "Kanal" sekmesi kanala göre gruplu gösterim içindir. Tüm izlenen
	 * kanalların ham emote set'lerini taşır (channelSlug etiketli). Verilmezse
	 * `index.allSets` kullanılır (tek-kanal / eski davranış — geriye dönük uyumlu).
	 */
	allChannelSets?: EmoteSet[];
}

/** Grup gösterimi için kanal etiketi: avatar kısaltması + slug + emote sayısı. */
interface ChannelEmoteGroup {
	slug: string;
	avatarLabel: string;
	emotes: EmoteEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Sprint 32: BTTV ve FFZ tablari kaldirildi (kullanici istegi).
// "kick" tab artik **kanal emote** (kick-channel + kick-subscriber + seventv-channel).
// "emoji" tab artik **Kick global** (kick-global setleri, Kick Global + Emoji
// dahil hepsi).
const TAB_ORDER: EpTabKey[] = ["favorites", "kick", "seventv", "emoji"];

// Values are i18n keys (resolved via t()) or literal provider names.
const TAB_LABEL: Record<EpTabKey, string> = {
	favorites: "emotepicker.tab.favorites",
	kick: "emotepicker.tab.channel",
	seventv: "7TV",
	bttv: "BTTV",
	ffz: "FFZ",
	emoji: "emotepicker.tab.emoji",
};

/** Resolve a TAB_LABEL entry: translate i18n keys, pass literal provider names through. */
const tabLabel = (t: (k: string) => string, key: EpTabKey): string => {
	const v = TAB_LABEL[key];
	return v.includes(".") ? t(v) : v;
};

// ─── Provider helpers ─────────────────────────────────────────────────────────

const isKickProvider = (p: EmoteProvider) => p.startsWith("kick-");
const isSevenTvProvider = (p: EmoteProvider) => p.startsWith("seventv-");
const isBttvProvider = (p: EmoteProvider) => p.startsWith("bttv-");
const isFfzProvider = (p: EmoteProvider) => p.startsWith("ffz-");

const filterSetsForTab = (sets: EmoteSet[], tab: EpTabKey): EmoteSet[] => {
	switch (tab) {
		case "kick":
			// Kanal emote: Kick channel + Kick subscriber + 7TV channel.
			return sets.filter(
				(s) =>
					s.provider === "kick-channel" ||
					s.provider === "kick-subscriber" ||
					s.provider === "seventv-channel" ||
					s.provider === "seventv-personal"
			);
		case "seventv":
			return sets.filter((s) => isSevenTvProvider(s.provider));
		case "bttv":
			return sets.filter((s) => isBttvProvider(s.provider));
		case "ffz":
			return sets.filter((s) => isFfzProvider(s.provider));
		case "emoji":
			// Kick global (eski "Kick" + "Emoji" karisik).
			return sets.filter((s) => s.provider === "kick-global");
		default:
			return sets;
	}
};

const countForTab = (
	tab: EpTabKey,
	allSets: EmoteSet[],
	favoriteEntries: EmoteEntry[]
): number => {
	if (tab === "favorites") return favoriteEntries.length;
	return filterSetsForTab(allSets, tab).reduce(
		(acc, s) => acc + s.emotes.length,
		0
	);
};

const avatarLabelFor = (slug: string): string =>
	slug.slice(0, 2).toUpperCase();

/**
 * Faz 7 — "kick" (Kanal) sekmesi için izlenen-kanala göre gruplama.
 * CONSTRAINT-5 (Kick precedence): bu yalnız GÖRSEL gruplamadır; hangi setlerin
 * "kick" sekmesine dahil olduğu hâlâ filterSetsForTab("kick", ...) belirler —
 * arama/insert/precedence davranışı değişmez, dedupe de tabEmotes ile aynı
 * kaynaktan (aynı sets) türetildiği için tutarlıdır.
 */
const buildChannelGroups = (kickTabSets: EmoteSet[]): ChannelEmoteGroup[] => {
	const bySlug = new Map<string, ChannelEmoteGroup>();
	const noSlug: EmoteEntry[] = [];
	for (const set of kickTabSets) {
		const slug = set.channelSlug;
		if (!slug) {
			noSlug.push(...set.emotes);
			continue;
		}
		const existing = bySlug.get(slug);
		if (existing) {
			existing.emotes.push(...set.emotes);
		} else {
			bySlug.set(slug, {
				slug,
				avatarLabel: avatarLabelFor(slug),
				emotes: [...set.emotes],
			});
		}
	}
	const groups = Array.from(bySlug.values()).sort((a, b) =>
		a.slug.localeCompare(b.slug)
	);
	if (noSlug.length) {
		groups.push({ slug: "", avatarLabel: "?", emotes: noSlug });
	}
	return groups.filter((g) => g.emotes.length > 0);
};

// Provider group tallies for footer
const tallyByGroup = (allSets: EmoteSet[]) => {
	let kick = 0;
	let s7tv = 0;
	let bttv = 0;
	let ffz = 0;
	for (const set of allSets) {
		const count = set.emotes.length;
		if (isKickProvider(set.provider)) kick += count;
		else if (isSevenTvProvider(set.provider)) s7tv += count;
		else if (isBttvProvider(set.provider)) bttv += count;
		else if (isFfzProvider(set.provider)) ffz += count;
	}
	return { kick, s7tv, bttv, ffz };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const refOf = (entry: EmoteEntry): FavoriteEmoteRef => ({
	provider: entry.provider,
	id: entry.id,
	name: entry.name,
});

interface EmoteCellProps {
	entry: EmoteEntry;
	isFav: boolean;
	isHovered: boolean;
	onSelect: () => void; // tek tık — preview seç
	onPick: () => void; // çift tık — inputa ekle
	onContextMenu: (e: React.MouseEvent) => void;
}

const EmoteCell: FunctionComponent<EmoteCellProps> = ({
	entry,
	isFav,
	isHovered,
	onSelect,
	onPick,
	onContextMenu,
}) => {
	const cls = [
		"ep-cell",
		isFav ? "is-fav" : "",
		isHovered ? "is-hovered" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button
			type="button"
			className={cls}
			title={`${entry.name} — çift tık: ekle`}
			onClick={onSelect}
			onDoubleClick={onPick}
			onContextMenu={onContextMenu}
			aria-label={entry.name}
		>
			<img
				src={entry.urls["1x"]}
				alt={entry.name}
				loading="lazy"
				style={{ width: 28, height: 28, objectFit: "contain" }}
			/>
			{entry.animated && <span className="ind">GIF</span>}
		</button>
	);
};

interface ProviderBadgeProps {
	provider: EmoteProvider;
}

const ProviderBadge: FunctionComponent<ProviderBadgeProps> = ({ provider }) => {
	const cls = provider.startsWith("kick")
		? "pbadge kick"
		: provider.startsWith("seventv")
		? "pbadge s7tv"
		: provider.startsWith("bttv")
		? "pbadge bttv"
		: provider.startsWith("ffz")
		? "pbadge ffz"
		: "pbadge";
	return <span className={cls}>{PROVIDER_LABEL[provider]}</span>;
};

// ─── EmotePickerModern ────────────────────────────────────────────────────────

const EmotePickerModern: FunctionComponent<EmotePickerModernProps> = ({
	open,
	onClose,
	index,
	onPick,
	onRefresh,
	anchorRef,
	allChannelSets,
}) => {
	const { t } = useTranslation();
	const [tab, setTab] = useState<EpTabKey>("kick");
	const [query, setQuery] = useState("");
	const [hovered, setHovered] = useState<EmoteEntry | undefined>();
	const [favorites, setFavorites] = useState<FavoriteEmoteRef[]>(() =>
		getFavoriteEmotes()
	);

	const searchInputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const titleId = "ep-modal-title";

	// Sprint 7 — Focus trap: cycles focus inside modal, restores on Escape/close
	useFocusTrap(containerRef, open, onClose);

	// Sync favorites from storage events
	useEffect(() => {
		if (!open) return;
		const refresh = () => setFavorites(getFavoriteEmotes());
		window.addEventListener(FAVORITES_CHANGED_EVENT, refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener(FAVORITES_CHANGED_EVENT, refresh);
			window.removeEventListener("storage", refresh);
		};
	}, [open]);

	// Auto-focus search on open
	useEffect(() => {
		if (open) {
			setQuery("");
			setHovered(undefined);
			setTimeout(() => searchInputRef.current?.focus(), 30);
		}
	}, [open]);

	// Click-outside + Escape to close
	useEffect(() => {
		if (!open) return;
		const handleMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (containerRef.current?.contains(target)) return;
			if (anchorRef?.current?.contains(target)) return;
			onClose();
		};
		const handleKey = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("keydown", handleKey);
		};
	}, [open, onClose, anchorRef]);

	const favoriteKeys = useMemo(() => {
		const set = new Set<string>();
		for (const ref of favorites) {
			set.add(`${ref.provider}:${ref.id}:${ref.name}`);
		}
		return set;
	}, [favorites]);

	const favoriteEntries = useMemo(() => {
		const list: EmoteEntry[] = [];
		for (const ref of favorites) {
			const match = index.all.find(
				(e) =>
					e.provider === ref.provider &&
					e.id === ref.id &&
					e.name === ref.name
			);
			if (match) list.push(match);
		}
		return list;
	}, [favorites, index]);

	const tabSets = useMemo(() => {
		if (tab === "favorites") return [] as EmoteSet[];
		return filterSetsForTab(index.allSets, tab);
	}, [tab, index]);

	const tabEmotes = useMemo(() => {
		if (tab === "favorites") return favoriteEntries;
		return tabSets.flatMap((s) => s.emotes);
	}, [tab, tabSets, favoriteEntries]);

	// Faz 7: "Kanal" (kick) sekmesi izlenen-kanala göre gruplu gösterilir.
	// allChannelSets sağlanmışsa (çok-kanallı gerçek app akışı) ondan; yoksa
	// index.allSets'ten (tek-kanal / test) türetilir — precedence/arama index'ten
	// gelmeye devam eder, bu yalnız grid'in görsel bölünmesidir.
	const channelGroups = useMemo(() => {
		if (tab !== "kick") return [] as ChannelEmoteGroup[];
		const sourceSets = filterSetsForTab(allChannelSets ?? index.allSets, "kick");
		return buildChannelGroups(sourceSets);
	}, [tab, allChannelSets, index]);

	const showChannelGroups =
		tab === "kick" && !query.trim() && channelGroups.length > 0;

	const queryResults = useMemo(() => {
		const trimmed = query.trim();
		if (!trimmed) return [] as EmoteEntry[];
		return searchEmotes(index, trimmed, 200);
	}, [query, index]);

	const displayList: EmoteEntry[] = query.trim() ? queryResults : tabEmotes;

	const tally = useMemo(() => tallyByGroup(index.allSets), [index]);
	const totalEmotes = index.all.length;

	const tabCounts = useMemo(() => {
		const counts: Record<EpTabKey, number> = {
			favorites: favoriteEntries.length,
			kick: 0,
			seventv: 0,
			bttv: 0,
			ffz: 0,
			emoji: 0,
		};
		for (const tabId of TAB_ORDER) {
			if (tabId !== "favorites") {
				counts[tabId] = countForTab(tabId, index.allSets, favoriteEntries);
			}
		}
		return counts;
	}, [index, favoriteEntries]);

	const handlePick = (entry: EmoteEntry) => {
		onPick(entry, { keepOpen: false });
		onClose();
	};

	const handleToggleFavorite = (entry: EmoteEntry) => {
		const next = toggleFavoriteEmote(refOf(entry));
		setFavorites(next);
	};

	const previewEntry = hovered ?? displayList[0];

	const renderEmoteCell = (entry: EmoteEntry) => {
		const key = `${entry.provider}:${entry.id}:${entry.name}`;
		return (
			<EmoteCell
				key={key}
				entry={entry}
				isFav={favoriteKeys.has(key)}
				isHovered={
					hovered
						? `${hovered.provider}:${hovered.id}:${hovered.name}` === key
						: false
				}
				onSelect={() => setHovered(entry)}
				onPick={() => handlePick(entry)}
				onContextMenu={(e) => {
					e.preventDefault();
					handleToggleFavorite(entry);
				}}
			/>
		);
	};

	if (!open) return null;

	return (
		<div
			className="modal-scrim"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			data-testid="ep-scrim"
		>
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="modal epicker"
				onMouseDown={(e) => e.stopPropagation()}
				data-testid="ep-modal"
			>
				{/* Header */}
				<div className="modal-hd">
					<h2 id={titleId}>
						<LuSmile size={15} aria-hidden />
						{t("emotepicker.title")}
					</h2>
					<button
						type="button"
						className="icon-btn"
						aria-label={t("emotepicker.close")}
						title={t("emotepicker.close-esc")}
						onClick={onClose}
						data-testid="ep-close"
					>
						<LuX size={14} aria-hidden />
					</button>
				</div>

				{/* Tabs */}
				<div className="ep-tabs" role="tablist">
					{TAB_ORDER.map((tabId) => (
						<button
							key={tabId}
							type="button"
							role="tab"
							aria-selected={tab === tabId}
							className={`ep-tab${tab === tabId ? " is-active" : ""}`}
							onClick={() => {
								setTab(tabId);
								setQuery("");
								setHovered(undefined);
							}}
							data-testid={`ep-tab-${tabId}`}
						>
							{tabLabel(t, tabId)}
							<span className="count">{tabCounts[tabId]}</span>
						</button>
					))}
				</div>

				{/* Search row */}
				<div className="ep-search-row">
					<div className="ep-search">
						<span className="ic" aria-hidden>
							<LuSearch size={14} />
						</span>
						<input
							ref={searchInputRef}
							type="text"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setHovered(undefined);
							}}
							placeholder={`${t("emotepicker.search")} ${tabLabel(t, tab)}…`}
							aria-label={`${t("emotepicker.search")} ${tabLabel(t, tab)} ${t("emotepicker.search-emotes")}`}
							data-testid="ep-search-input"
						/>
					</div>
					{onRefresh && (
						<button
							type="button"
							className="btn ghost"
							title={t("emotepicker.refresh-provider")}
							aria-label={t("emotepicker.refresh-provider")}
							onClick={() => onRefresh(tab)}
						>
							<LuRefreshCw size={13} aria-hidden />
						</button>
					)}
				</div>

				{/* Body: grid + preview */}
				<div className="ep-body">
					<div
						className="ep-grid scroll"
						data-testid="ep-grid"
					>
						{displayList.length === 0 && !showChannelGroups ? (
							<div
								className="ep-empty"
								style={{ gridColumn: "1 / -1" }}
								data-testid="ep-empty"
							>
								<LuSearch size={22} aria-hidden />
								{query.trim() ? (
									<>
										<div>No emotes match &ldquo;{query}&rdquo;</div>
										<button
											type="button"
											className="btn ghost"
											onClick={() => setQuery("")}
										>
											Clear
										</button>
									</>
								) : (
									<div>
										{tab === "favorites"
											? t("emotepicker.no-favorites")
											: `${tabLabel(t, tab)} ${t("emotepicker.no-loaded")}`}
									</div>
								)}
							</div>
						) : showChannelGroups ? (
							channelGroups.map((group) => (
								<React.Fragment key={group.slug || "__no-slug__"}>
									<div className="ep-group-hd" data-testid={`ep-group-${group.slug}`}>
										<span className="ava">{group.avatarLabel}</span>
										{group.slug || t("emotepicker.tab.channel")}
										<span className="cnt">{group.emotes.length}</span>
									</div>
									{group.emotes.map((entry) => renderEmoteCell(entry))}
								</React.Fragment>
							))
						) : (
							displayList.map((entry) => renderEmoteCell(entry))
						)}
					</div>

					{/* Preview pane */}
					<div className="ep-preview" data-testid="ep-preview">
						{previewEntry ? (
							<>
								<div className="ep-preview-img" data-testid="ep-preview-img">
									<img
										src={
											previewEntry.urls["3x"] ||
											previewEntry.urls["2x"] ||
											previewEntry.urls["1x"]
										}
										alt={previewEntry.name}
										style={{
											maxWidth: 120,
											maxHeight: 120,
											objectFit: "contain",
										}}
									/>
								</div>
								<div
									className="ep-preview-name mono"
									data-testid="ep-preview-name"
								>
									{previewEntry.name}
								</div>
								<div className="ep-preview-meta" data-testid="ep-preview-meta">
									<ProviderBadge provider={previewEntry.provider} />
									{" "}{t("emotepicker.from")}{" "}
									{isKickProvider(previewEntry.provider)
										? t("emotepicker.from-channel")
										: t("emotepicker.from-global")}
								</div>
								<div className="ep-preview-tags" data-testid="ep-preview-tags">
									{previewEntry.animated && (
										<span className="pbadge gif">GIF</span>
									)}
									{previewEntry.zeroWidth && (
										<span className="pbadge zw">{t("emotepicker.tag.zero-width")}</span>
									)}
									{previewEntry.subscribersOnly && (
										<span className="pbadge sub">{t("emotepicker.tag.subscriber")}</span>
									)}
								</div>
								<div
									style={{
										fontSize: 11,
										color: "var(--ms-fg-3, var(--fg-3))",
										lineHeight: 1.6,
										marginBottom: 12,
									}}
								>
									{t("emotepicker.insert-hint")}
									<br />
									{t("emotepicker.right-click")}{" "}
									{isFavoriteEmote(refOf(previewEntry))
										? t("emotepicker.unfavorite")
										: t("emotepicker.favorite")}
									.
								</div>
								<div className="ep-preview-actions">
									<button
										type="button"
										className="btn"
										onClick={() => handleToggleFavorite(previewEntry)}
									>
										<LuStar size={12} aria-hidden />
										{isFavoriteEmote(refOf(previewEntry))
											? t("emotepicker.unfavorite")
											: t("emotepicker.favorite")}
									</button>
									<button
										type="button"
										className="btn primary"
										onClick={() => handlePick(previewEntry)}
										data-testid="ep-insert-btn"
									>
										{t("emotepicker.insert")}
									</button>
								</div>
							</>
						) : (
							<div className="ep-empty">
								<LuSmile size={22} aria-hidden />
								{t("emotepicker.hover-preview")}
							</div>
						)}
					</div>
				</div>

				{/* Footer: provider status */}
				<div className="prov-status">
					<div className="row">
						<div className="prov-stat" title={t("emotepicker.provider.kick-emotes")}>
							<span className="prov-dot ok" />
							<span style={{ color: "var(--fg-2)" }}>Kick</span>
							<span className="mono num">{tally.kick}</span>
						</div>
						<div className="prov-stat" title={t("emotepicker.provider.7tv-emotes")}>
							<span className="prov-dot ok" />
							<span style={{ color: "var(--fg-2)" }}>7TV</span>
							<span className="mono num">{tally.s7tv}</span>
						</div>
						{/* Sprint 32: BTTV / FFZ footer status indicator'lari kaldirildi
						    (provider tablari da kaldirildi). */}
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<span>{totalEmotes} total</span>
						<span style={{ color: "var(--fg-4)" }}>·</span>
						{onRefresh && (
							<button
								type="button"
								className="btn ghost"
								style={{ padding: "3px 6px", fontSize: 11 }}
								onClick={() => onRefresh()}
							>
								<LuRefreshCw size={11} aria-hidden /> Refresh all
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default EmotePickerModern;
