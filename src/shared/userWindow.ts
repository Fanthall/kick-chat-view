import type { EmoteSet } from "../renderer/constants/emote";
import type { ModMessage, User, UserMessage } from "../renderer/util/chatInterface";

export interface UserWindowPayload {
	key: string;
	channelName?: string;
	canModerateChannel?: boolean;
	openedFrom: "chat" | "moderation";
	user: User;
	messages: UserMessage[];
	modActions: ModMessage[];
	updatedAt: number;
	/**
	 * Emote rendering icin gerekli kaynak veriler. UserWindow ayri Electron
	 * renderer'i oldugu icin Redux'a erisemiyor; bu yuzden IPC ile gondeririz.
	 * UserWindow tarafinda `buildEmoteIndex(channelEmoteSets, globalEmoteSets, channelName)`
	 * ile EmoteIndex lokal kurulur, sonra `renderMessageHtml` cagrilir.
	 *
	 * Optional cunku eski payload'lar (migration oncesi cached / persisted) bu
	 * alanlari icermeyebilir. Reader tarafinda `?? []` fallback uygula.
	 */
	channelEmoteSets?: EmoteSet[];
	globalEmoteSets?: EmoteSet[];
	blockedEmotes?: string[];
}
