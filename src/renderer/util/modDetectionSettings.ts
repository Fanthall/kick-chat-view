export const MOD_CHECK_MESSAGE_STORAGE_KEY = "chatViewModCheckMessage";
export const MOD_CHECK_SENT_CHANNELS_STORAGE_KEY =
	"chatViewModCheckSentChannelsV2";
export const DEFAULT_MOD_CHECK_MESSAGE = "TeaTime";

export const getModCheckMessage = () => {
	const savedMessage = localStorage.getItem(MOD_CHECK_MESSAGE_STORAGE_KEY);
	if (savedMessage === null) {
		return DEFAULT_MOD_CHECK_MESSAGE;
	}

	return savedMessage.trim();
};

export const setModCheckMessage = (message: string) => {
	const nextMessage = message.trim();
	if (!nextMessage) {
		localStorage.setItem(MOD_CHECK_MESSAGE_STORAGE_KEY, "");
		return "";
	}

	localStorage.setItem(MOD_CHECK_MESSAGE_STORAGE_KEY, nextMessage);
	return nextMessage;
};

const readSentChannels = () => {
	try {
		return JSON.parse(
			sessionStorage.getItem(MOD_CHECK_SENT_CHANNELS_STORAGE_KEY) || "[]"
		) as string[];
	} catch {
		return [];
	}
};

export const hasSentModCheckForChannel = (channelSlug: string) =>
	readSentChannels().includes(channelSlug.trim().toLowerCase());

export const markModCheckSentForChannel = (channelSlug: string) => {
	const normalizedChannelSlug = channelSlug.trim().toLowerCase();
	if (!normalizedChannelSlug) return;

	const sentChannels = new Set(readSentChannels());
	sentChannels.add(normalizedChannelSlug);
	sessionStorage.setItem(
		MOD_CHECK_SENT_CHANNELS_STORAGE_KEY,
		JSON.stringify(Array.from(sentChannels))
	);
};

export const unmarkModCheckSentForChannel = (channelSlug: string) => {
	const normalizedChannelSlug = channelSlug.trim().toLowerCase();
	sessionStorage.setItem(
		MOD_CHECK_SENT_CHANNELS_STORAGE_KEY,
		JSON.stringify(
			readSentChannels().filter((item) => item !== normalizedChannelSlug)
		)
	);
};
