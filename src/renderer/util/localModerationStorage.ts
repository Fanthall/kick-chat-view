const BLOCKED_EMOTES_KEY = "blockEmotes";
const SUSPENDED_USERS_KEY = "susUsers";

export const LOCAL_MODERATION_SETTINGS_CHANGED =
	"local-moderation-settings-changed";

const normalizeList = (values: string[]) => {
	const seen = new Set<string>();

	return values
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
		.filter((value) => {
			const key = value.toLowerCase();
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
};

const readStringList = (key: string) => {
	const rawValue = localStorage.getItem(key);
	if (!rawValue) {
		return [];
	}

	try {
		const parsed = JSON.parse(rawValue);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return normalizeList(
			parsed.filter((item): item is string => typeof item === "string")
		);
	} catch {
		return [];
	}
};

const writeStringList = (key: string, values: string[]) => {
	const nextValues = normalizeList(values);
	localStorage.setItem(key, JSON.stringify(nextValues));
	window.dispatchEvent(new Event(LOCAL_MODERATION_SETTINGS_CHANGED));
	return nextValues;
};

const addStringItem = (key: string, value: string) => {
	return writeStringList(key, [...readStringList(key), value]);
};

const removeStringItem = (key: string, value: string) => {
	const target = value.trim().toLowerCase();
	return writeStringList(
		key,
		readStringList(key).filter((item) => item.toLowerCase() !== target)
	);
};

export const getBlockedEmotes = () => readStringList(BLOCKED_EMOTES_KEY);

export const addBlockedEmote = (value: string) =>
	addStringItem(BLOCKED_EMOTES_KEY, value);

export const removeBlockedEmote = (value: string) =>
	removeStringItem(BLOCKED_EMOTES_KEY, value);

export const getSuspendedUsers = () => readStringList(SUSPENDED_USERS_KEY);

export const addSuspendedUser = (value: string) =>
	addStringItem(SUSPENDED_USERS_KEY, value);

export const removeSuspendedUser = (value: string) =>
	removeStringItem(SUSPENDED_USERS_KEY, value);
