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
}
