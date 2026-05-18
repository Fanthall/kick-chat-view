import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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

type TabKey = "favorites" | "kick" | "seventv" | "bttv" | "ffz" | "emoji";

interface EmotePickerProps {
	open: boolean;
	onClose: () => void;
	index: EmoteIndex;
	onPick: (entry: EmoteEntry, options: { keepOpen: boolean }) => void;
	onRefresh?: () => void;
	anchorRef?: React.RefObject<HTMLElement>;
}

const TAB_LABELS: Record<TabKey, string> = {
	favorites: "★",
	kick: "Kick",
	seventv: "7TV",
	bttv: "BTTV",
	ffz: "FFZ",
	emoji: "Emoji",
};

const isSevenTvProvider = (provider: EmoteProvider) =>
	provider.startsWith("seventv-");

const isKickProvider = (provider: EmoteProvider) =>
	provider.startsWith("kick-");

const isBttvProvider = (provider: EmoteProvider) =>
	provider.startsWith("bttv-");

const isFfzProvider = (provider: EmoteProvider) =>
	provider.startsWith("ffz-");

const filterSetsForTab = (sets: EmoteSet[], tab: TabKey): EmoteSet[] => {
	switch (tab) {
		case "seventv":
			return sets.filter((set) => isSevenTvProvider(set.provider));
		case "kick":
			return sets.filter(
				(set) =>
					isKickProvider(set.provider) &&
					!(
						set.provider === "kick-global" &&
						set.name.toLowerCase().includes("emoji")
					)
			);
		case "bttv":
			return sets.filter((set) => isBttvProvider(set.provider));
		case "ffz":
			return sets.filter((set) => isFfzProvider(set.provider));
		case "emoji":
			return sets.filter(
				(set) =>
					set.provider === "kick-global" &&
					set.name.toLowerCase().includes("emoji")
			);
		default:
			return sets;
	}
};

const refOf = (entry: EmoteEntry): FavoriteEmoteRef => ({
	provider: entry.provider,
	id: entry.id,
	name: entry.name,
});

const ProviderTag: FunctionComponent<{ provider: EmoteProvider }> = ({
	provider,
}) => (
	<span className={`emote-provider-tag emote-provider-tag--${provider}`}>
		{PROVIDER_LABEL[provider]}
	</span>
);

const EmoteThumb: FunctionComponent<{
	entry: EmoteEntry;
	onClick: (entry: EmoteEntry, shift: boolean) => void;
	onHover: (entry: EmoteEntry) => void;
	favorite: boolean;
	onToggleFavorite: (entry: EmoteEntry) => void;
}> = ({ entry, onClick, onHover, favorite, onToggleFavorite }) => {
	return (
		<button
			type="button"
			className="emote-grid-item"
			title={entry.name}
			onMouseEnter={() => onHover(entry)}
			onContextMenu={(event) => {
				event.preventDefault();
				onToggleFavorite(entry);
			}}
			onClick={(event) => onClick(entry, event.shiftKey)}
		>
			<img
				src={entry.urls["1x"]}
				alt={entry.name}
				loading="lazy"
				className="emote-grid-img"
			/>
			{entry.animated && <span className="emote-badge emote-badge--gif">GIF</span>}
			{entry.zeroWidth && <span className="emote-badge emote-badge--zw">ZW</span>}
			{favorite && <span className="emote-favorite-pin">★</span>}
		</button>
	);
};

const EmoteSetBlock: FunctionComponent<{
	set: EmoteSet;
	onPick: (entry: EmoteEntry, shift: boolean) => void;
	onHover: (entry: EmoteEntry) => void;
	favoriteKeys: Set<string>;
	onToggleFavorite: (entry: EmoteEntry) => void;
}> = ({ set, onPick, onHover, favoriteKeys, onToggleFavorite }) => {
	const [collapsed, setCollapsed] = useState(false);
	if (!set.emotes.length) return null;
	return (
		<div className="emote-set-block">
			<button
				type="button"
				className="emote-set-header"
				onClick={() => setCollapsed((v) => !v)}
			>
				<ProviderTag provider={set.provider} />
				<span className="emote-set-name">{set.name}</span>
				{set.ownerName && (
					<span className="emote-set-owner">by {set.ownerName}</span>
				)}
				<span className="emote-set-toggle">{collapsed ? "›" : "⌄"}</span>
			</button>
			{!collapsed && (
				<div className="emote-grid">
					{set.emotes.map((entry) => {
						const key = `${entry.provider}:${entry.id}:${entry.name}`;
						return (
							<EmoteThumb
								key={key}
								entry={entry}
								onClick={onPick}
								onHover={onHover}
								favorite={favoriteKeys.has(key)}
								onToggleFavorite={onToggleFavorite}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
};

const EmotePicker: FunctionComponent<EmotePickerProps> = ({
	open,
	onClose,
	index,
	onPick,
	onRefresh,
	anchorRef,
}) => {
	const [tab, setTab] = useState<TabKey>("kick");
	const [query, setQuery] = useState("");
	const [hovered, setHovered] = useState<EmoteEntry | undefined>();
	const [favorites, setFavorites] = useState<FavoriteEmoteRef[]>(() =>
		getFavoriteEmotes()
	);
	const containerRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		if (!open) return;
		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (containerRef.current?.contains(target)) return;
			if (anchorRef?.current?.contains(target)) return;
			onClose();
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
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
				(entry) =>
					entry.provider === ref.provider &&
					entry.id === ref.id &&
					entry.name === ref.name
			);
			if (match) list.push(match);
		}
		return list;
	}, [favorites, index]);

	const tabSets = useMemo(() => {
		if (tab === "favorites") return [] as EmoteSet[];
		return filterSetsForTab(index.allSets, tab);
	}, [tab, index]);

	const queryResults = useMemo(() => {
		const trimmed = query.trim();
		if (!trimmed) return [] as EmoteEntry[];
		return searchEmotes(index, trimmed, 60);
	}, [query, index]);

	if (!open) return null;

	const handlePick = (entry: EmoteEntry, shift: boolean) => {
		onPick(entry, { keepOpen: shift });
	};

	const handleToggleFavorite = (entry: EmoteEntry) => {
		const next = toggleFavoriteEmote(refOf(entry));
		setFavorites(next);
	};

	return (
		<div
			ref={containerRef}
			className="emote-picker"
			onMouseDown={(event) => event.stopPropagation()}
		>
			<div className="emote-picker-tabs">
				{(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
					<button
						key={key}
						type="button"
						className={`emote-picker-tab ${tab === key ? "active" : ""}`}
						onClick={() => setTab(key)}
					>
						{TAB_LABELS[key]}
					</button>
				))}
				{onRefresh && (
					<button
						type="button"
						className="emote-picker-tab emote-picker-tab--icon"
						onClick={() => onRefresh()}
						aria-label="Refresh"
						title="Yenile"
					>
						⟳
					</button>
				)}
				<button
					type="button"
					className="emote-picker-tab emote-picker-tab--close"
					onClick={onClose}
					aria-label="Close"
				>
					×
				</button>
			</div>

			<div className="emote-picker-search">
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Emote ara"
					autoFocus
				/>
			</div>

			{hovered && (
				<div className="emote-picker-preview">
					<img
						src={hovered.urls["3x"] || hovered.urls["2x"] || hovered.urls["1x"]}
						alt={hovered.name}
					/>
					<div className="emote-picker-preview-meta">
						<div className="emote-picker-preview-name">
							{hovered.name}
							{hovered.animated && (
								<span className="emote-badge emote-badge--gif">GIF</span>
							)}
							{hovered.zeroWidth && (
								<span className="emote-badge emote-badge--zw">ZW</span>
							)}
						</div>
						{hovered.ownerName && (
							<div className="emote-picker-preview-owner">
								by {hovered.ownerName}
							</div>
						)}
						<div className="emote-picker-preview-provider">
							{PROVIDER_LABEL[hovered.provider]}
						</div>
					</div>
				</div>
			)}

			<div className="emote-picker-body">
				{query.trim() ? (
					queryResults.length ? (
						<div className="emote-grid">
							{queryResults.map((entry) => {
								const key = `${entry.provider}:${entry.id}:${entry.name}`;
								return (
									<EmoteThumb
										key={key}
										entry={entry}
										onClick={handlePick}
										onHover={setHovered}
										favorite={favoriteKeys.has(key)}
										onToggleFavorite={handleToggleFavorite}
									/>
								);
							})}
						</div>
					) : (
						<div className="emote-picker-empty">Eslesen emote yok.</div>
					)
				) : tab === "favorites" ? (
					favoriteEntries.length ? (
						<div className="emote-grid">
							{favoriteEntries.map((entry) => {
								const key = `${entry.provider}:${entry.id}:${entry.name}`;
								return (
									<EmoteThumb
										key={key}
										entry={entry}
										onClick={handlePick}
										onHover={setHovered}
										favorite={true}
										onToggleFavorite={handleToggleFavorite}
									/>
								);
							})}
						</div>
					) : (
						<div className="emote-picker-empty">
							Henuz favori yok. Bir emote'a sag tikla.
						</div>
					)
				) : tabSets.length ? (
					tabSets.map((set, idx) => (
						<EmoteSetBlock
							key={`${set.provider}:${set.id ?? idx}:${set.name}`}
							set={set}
							onPick={handlePick}
							onHover={setHovered}
							favoriteKeys={favoriteKeys}
							onToggleFavorite={handleToggleFavorite}
						/>
					))
				) : (
					<div className="emote-picker-empty">
						{tab === "kick"
							? "Kanal/abone emote bulunamadi."
							: tab === "seventv"
							? "7TV emote bulunamadi."
							: "Emoji yok."}
					</div>
				)}
			</div>

			<div className="emote-picker-footer">
				<span>Sag tik: favori</span>
				<span>Shift+tik: secip acik tut</span>
			</div>
		</div>
	);
};

export default EmotePicker;
