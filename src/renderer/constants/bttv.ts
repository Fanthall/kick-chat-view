export type BttvImageType = "png" | "gif" | "webp" | "avif";

export interface BttvEmote {
	id: string;
	code: string;
	imageType?: BttvImageType;
	animated?: boolean;
	userId?: string;
	user?: {
		id: string;
		name: string;
		displayName?: string;
	};
}

export interface BttvUserResponse {
	id: string;
	bots?: string[];
	avatar?: string;
	channelEmotes: BttvEmote[];
	sharedEmotes: BttvEmote[];
}
