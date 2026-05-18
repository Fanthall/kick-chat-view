const FAVORITES_KEY = "chatViewEmoteFavorites";

export const FAVORITES_CHANGED_EVENT = "chat-view-emote-favorites-changed";

export interface FavoriteEmoteRef {
	provider: string;
	id: string;
	name: string;
}

const favoriteKey = (ref: FavoriteEmoteRef) =>
	`${ref.provider}:${ref.id}:${ref.name}`;

const readRaw = (): FavoriteEmoteRef[] => {
	const raw = localStorage.getItem(FAVORITES_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item) =>
				item &&
				typeof item === "object" &&
				typeof item.provider === "string" &&
				typeof item.id === "string" &&
				typeof item.name === "string"
		);
	} catch {
		return [];
	}
};

const writeRaw = (list: FavoriteEmoteRef[]) => {
	const seen = new Set<string>();
	const dedup = list.filter((ref) => {
		const key = favoriteKey(ref);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	localStorage.setItem(FAVORITES_KEY, JSON.stringify(dedup));
	window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
	return dedup;
};

export const getFavoriteEmotes = (): FavoriteEmoteRef[] => readRaw();

export const isFavoriteEmote = (ref: FavoriteEmoteRef) => {
	const list = readRaw();
	const key = favoriteKey(ref);
	return list.some((item) => favoriteKey(item) === key);
};

export const toggleFavoriteEmote = (ref: FavoriteEmoteRef) => {
	const list = readRaw();
	const key = favoriteKey(ref);
	if (list.some((item) => favoriteKey(item) === key)) {
		return writeRaw(list.filter((item) => favoriteKey(item) !== key));
	}
	return writeRaw([ref, ...list]);
};

export const removeFavoriteEmote = (ref: FavoriteEmoteRef) => {
	const key = favoriteKey(ref);
	return writeRaw(readRaw().filter((item) => favoriteKey(item) !== key));
};
