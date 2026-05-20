import { ChatViewChannel } from "./channelSettings";

// REQ-2: Kendi kanali default gosterme.
// - OAuth bagliyken ve local manuel active channel yoksa ilk own channel'i active yap.
// - Manuel secim (chatViewActiveChannel localStorage) korunur.
// - Own channel yoksa hicbir sey degistirme (Settings empty state yine net gozukur).
// CONSTRAINT-2: localStorage anahtarlari (chatViewActiveChannel, chatViewChannels) backward compatible.

// Minimal shape kontratlari — Electron preload tip degisikliklerine bagimsiz olsun diye locally
// inline tutuyoruz.
export interface AuthStatusLike {
	isConnected: boolean;
}

export interface OwnChannelLike {
	slug?: string;
	broadcaster_user_id?: number;
}

export interface OwnChannelsResponseLike {
	data?: OwnChannelLike[];
}

export interface BootstrapDeps {
	getAuthStatus: () => Promise<AuthStatusLike | undefined>;
	getOwnChannels: () => Promise<OwnChannelsResponseLike | undefined>;
	getActiveChannelSlug: () => string | undefined;
	getChannelList: () => ChatViewChannel[];
	setActiveChannelSlug: (slug: string) => void;
	addChannel: (slug: string) => ChatViewChannel[];
}

export type BootstrapOutcome =
	| "skipped_oauth_disconnected"
	| "skipped_active_already_set"
	| "skipped_no_own_channels"
	| "set_active_from_existing_list"
	| "added_and_set_active";

const normalizeSlug = (slug?: string | null): string => {
	if (!slug) return "";
	return String(slug).trim().toLowerCase();
};

export const bootstrapDefaultOwnChannel = async (
	deps: BootstrapDeps
): Promise<BootstrapOutcome> => {
	// 1) Manuel secim varsa NEVER override (REQ-2 acceptance #2).
	const existingActive = deps.getActiveChannelSlug();
	if (existingActive) {
		return "skipped_active_already_set";
	}

	// 2) OAuth bagli mi? Bagli degilse default-channel akisini tetikleme;
	// klasik localStorage akisi (channels[0]) caller'da kalir.
	let auth: AuthStatusLike | undefined;
	try {
		auth = await deps.getAuthStatus();
	} catch {
		auth = undefined;
	}
	if (!auth?.isConnected) {
		return "skipped_oauth_disconnected";
	}

	// 3) Own channel listesini cek; hata/bos cevapsa sessiz cik.
	let ownResponse: OwnChannelsResponseLike | undefined;
	try {
		ownResponse = await deps.getOwnChannels();
	} catch {
		ownResponse = undefined;
	}
	const firstOwn = (ownResponse?.data || []).find((c) => normalizeSlug(c?.slug));
	const firstOwnSlug = normalizeSlug(firstOwn?.slug);
	if (!firstOwnSlug) {
		return "skipped_no_own_channels";
	}

	// 4) Own channel mevcut chatViewChannels icinde mi?
	const existingList = deps.getChannelList();
	const alreadyInList = existingList.some(
		(c) => normalizeSlug(c.slug) === firstOwnSlug
	);

	if (alreadyInList) {
		deps.setActiveChannelSlug(firstOwnSlug);
		return "set_active_from_existing_list";
	}

	// 5) Yoksa ekle (autoConnect default true via addChannel).
	deps.addChannel(firstOwnSlug);
	deps.setActiveChannelSlug(firstOwnSlug);
	return "added_and_set_active";
};
