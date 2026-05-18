export interface StreamCategoryMeta {
	id: number;
	name: string;
	thumbnail?: string;
}

export interface StreamMeta {
	channelSlug: string;
	broadcasterUserId?: number;
	streamTitle?: string;
	category?: StreamCategoryMeta;
	customTags?: string[];
	viewerCount?: number;
	isLive?: boolean;
	startedAt?: string;
	updatedAt: number;
}
