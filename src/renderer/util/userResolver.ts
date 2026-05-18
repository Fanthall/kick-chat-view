import { UserMessage } from "./chatInterface";

interface CachedResolvedUser {
	message: UserMessage;
	expiresAt: number;
}

const RESOLVED_USER_CACHE_MS = 5 * 60 * 1000;
const resolvedUserCache = new Map<string, CachedResolvedUser>();

const normalizeUsername = (username: string) =>
	username.replace(/^@/, "").trim().toLowerCase();

const buildSyntheticUserMessage = (
	selectedUsername: string,
	userId: number
): UserMessage => {
	const cleanUsername = selectedUsername.replace(/^@/, "").trim();
	return {
		id: `synthetic-user-${userId || cleanUsername}`,
		chatroom_id: 0,
		content: "User loaded by resolver",
		type: "synthetic",
		created_at: new Date().toISOString(),
		sender: {
			id: userId,
			username: cleanUsername,
			slug: cleanUsername,
			identity: {
				color: "#2fd3a0",
				badges: [],
			},
		},
	};
};

export const resolveUserMessage = async (
	selectedUsername: string,
	messageList: UserMessage[]
) => {
	const normalizedUsername = normalizeUsername(selectedUsername);
	const localMessage = [...messageList]
		.reverse()
		.find(
			(message) =>
				message.sender?.username?.toLowerCase() === normalizedUsername ||
				message.sender?.slug?.toLowerCase() === normalizedUsername
		);

	if (localMessage) {
		return localMessage;
	}

	const cachedUser = resolvedUserCache.get(normalizedUsername);
	if (cachedUser && cachedUser.expiresAt > Date.now()) {
		return cachedUser.message;
	}

	const channelResponse = await window.electron.kick.getChannelBySlug(
		normalizedUsername
	);
	const channel = channelResponse?.data?.[0];
	if (!channel?.broadcaster_user_id) {
		throw new Error(
			`${selectedUsername.replace(
				/^@/,
				""
			)} is not in captured chat and could not be resolved by Kick channel slug.`
		);
	}

	const resolvedMessage = buildSyntheticUserMessage(
		channel.slug || normalizedUsername,
		channel.broadcaster_user_id
	);
	resolvedUserCache.set(normalizedUsername, {
		message: resolvedMessage,
		expiresAt: Date.now() + RESOLVED_USER_CACHE_MS,
	});

	return resolvedMessage;
};
