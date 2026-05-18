export interface ChatViewChannel {
	slug: string;
	autoConnect: boolean;
}

export const CHANNEL_LIST_STORAGE_KEY = "chatViewChannels";
export const ACTIVE_CHANNEL_STORAGE_KEY = "chatViewActiveChannel";

const normalizeSlug = (slug: string) => slug.trim().toLowerCase();

export const getChannelList = (): ChatViewChannel[] => {
	const savedChannels = localStorage.getItem(CHANNEL_LIST_STORAGE_KEY);
	const legacyChannelName = localStorage.getItem("channelName");
	let channels: ChatViewChannel[] = [];

	if (savedChannels) {
		try {
			const parsedChannels = JSON.parse(savedChannels) as ChatViewChannel[];
			channels = parsedChannels
				.map((channel) => ({
					slug: normalizeSlug(channel.slug),
					autoConnect: channel.autoConnect !== false,
				}))
				.filter((channel) => channel.slug);
		} catch {
			channels = [];
		}
	}

	if (legacyChannelName) {
		const normalizedLegacyChannel = normalizeSlug(legacyChannelName);
		if (
			normalizedLegacyChannel &&
			!channels.some((channel) => channel.slug === normalizedLegacyChannel)
		) {
			channels.unshift({
				slug: normalizedLegacyChannel,
				autoConnect: true,
			});
		}
	}

	return channels;
};

export const saveChannelList = (channels: ChatViewChannel[]) => {
	const normalizedChannels = channels
		.map((channel) => ({
			slug: normalizeSlug(channel.slug),
			autoConnect: channel.autoConnect !== false,
		}))
		.filter((channel) => channel.slug);
	localStorage.setItem(CHANNEL_LIST_STORAGE_KEY, JSON.stringify(normalizedChannels));

	if (normalizedChannels.length > 0) {
		const activeChannel = getActiveChannelSlug();
		if (!activeChannel || !normalizedChannels.some((channel) => channel.slug === activeChannel)) {
			setActiveChannelSlug(normalizedChannels[0].slug);
		}
	}

	return normalizedChannels;
};

export const getActiveChannelSlug = () => {
	const activeChannel = normalizeSlug(
		localStorage.getItem(ACTIVE_CHANNEL_STORAGE_KEY) ||
			localStorage.getItem("channelName") ||
			""
	);

	return activeChannel || undefined;
};

export const setActiveChannelSlug = (slug: string) => {
	const normalizedSlug = normalizeSlug(slug);
	if (!normalizedSlug) return;
	localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, normalizedSlug);
	localStorage.setItem("channelName", normalizedSlug);
};

export const addChannel = (slug: string) => {
	const normalizedSlug = normalizeSlug(slug);
	if (!normalizedSlug) {
		return getChannelList();
	}

	const channels = getChannelList();
	if (!channels.some((channel) => channel.slug === normalizedSlug)) {
		channels.push({ slug: normalizedSlug, autoConnect: true });
	}
	return saveChannelList(channels);
};

export const removeChannel = (slug: string) => {
	const normalizedSlug = normalizeSlug(slug);
	const channels = saveChannelList(
		getChannelList().filter((channel) => channel.slug !== normalizedSlug)
	);
	if (getActiveChannelSlug() === normalizedSlug) {
		if (channels[0]) {
			setActiveChannelSlug(channels[0].slug);
		} else {
			localStorage.removeItem(ACTIVE_CHANNEL_STORAGE_KEY);
			localStorage.removeItem("channelName");
		}
	}

	return channels;
};

export const updateChannelAutoConnect = (slug: string, autoConnect: boolean) => {
	const normalizedSlug = normalizeSlug(slug);
	return saveChannelList(
		getChannelList().map((channel) =>
			channel.slug === normalizedSlug ? { ...channel, autoConnect } : channel
		)
	);
};
