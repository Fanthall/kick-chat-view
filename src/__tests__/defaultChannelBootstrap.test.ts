import {
	bootstrapDefaultOwnChannel,
	BootstrapDeps,
} from "../renderer/util/defaultChannelBootstrap";
import { ChatViewChannel } from "../renderer/util/channelSettings";

// REQ-2 acceptance:
// 1) OAuth connected + getOwnChannels veri donerse + local active channel yoksa -> ilk own channel active.
// 2) Kullanici daha once manuel active channel sectiyse -> secim korunur.
// 3) Own channel yoksa -> Settings empty state akisi (bootstrap dokunmaz).

interface MockState {
	active: string;
	channels: ChatViewChannel[];
	addCalls: string[];
	setActiveCalls: string[];
}

const buildDeps = (
	overrides: Partial<BootstrapDeps> & {
		initialActive?: string;
		initialChannels?: ChatViewChannel[];
		authConnected?: boolean;
		ownChannelsResponse?: { data?: { slug?: string }[] } | undefined;
		ownChannelsReject?: boolean;
		authReject?: boolean;
	} = {}
): { deps: BootstrapDeps; state: MockState } => {
	const state: MockState = {
		active: overrides.initialActive || "",
		channels: overrides.initialChannels ? [...overrides.initialChannels] : [],
		addCalls: [],
		setActiveCalls: [],
	};

	const deps: BootstrapDeps = {
		getAuthStatus:
			overrides.getAuthStatus ||
			(() =>
				overrides.authReject
					? Promise.reject(new Error("auth boom"))
					: Promise.resolve({ isConnected: !!overrides.authConnected })),
		getOwnChannels:
			overrides.getOwnChannels ||
			(() =>
				overrides.ownChannelsReject
					? Promise.reject(new Error("own boom"))
					: Promise.resolve(overrides.ownChannelsResponse)),
		getActiveChannelSlug: () => state.active || undefined,
		getChannelList: () => state.channels,
		setActiveChannelSlug: (slug: string) => {
			state.setActiveCalls.push(slug);
			state.active = slug;
		},
		addChannel: (slug: string) => {
			state.addCalls.push(slug);
			if (!state.channels.some((c) => c.slug === slug)) {
				state.channels.push({ slug, autoConnect: true });
			}
			return state.channels;
		},
	};
	return { deps, state };
};

describe("bootstrapDefaultOwnChannel > REQ-2", () => {
	it("OAuth disconnected -> hicbir sey degistirmez (skipped_oauth_disconnected)", async () => {
		const { deps, state } = buildDeps({ authConnected: false });
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_oauth_disconnected");
		expect(state.setActiveCalls).toEqual([]);
		expect(state.addCalls).toEqual([]);
	});

	it("manuel active channel varsa -> bootstrap SKIP (skipped_active_already_set)", async () => {
		const { deps, state } = buildDeps({
			initialActive: "user-pick",
			authConnected: true,
			ownChannelsResponse: { data: [{ slug: "owner-handle" }] },
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_active_already_set");
		// auth/own asla cagrilmaz cunku early-return on existingActive
		expect(state.setActiveCalls).toEqual([]);
		expect(state.addCalls).toEqual([]);
		expect(state.active).toBe("user-pick");
	});

	it("own channel yoksa -> hic bir sey ekleme (skipped_no_own_channels)", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			ownChannelsResponse: { data: [] },
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_no_own_channels");
		expect(state.setActiveCalls).toEqual([]);
		expect(state.addCalls).toEqual([]);
	});

	it("own channel zaten chatViewChannels icindeyse -> sadece active set (set_active_from_existing_list)", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			initialChannels: [{ slug: "ownerhandle", autoConnect: true }],
			ownChannelsResponse: { data: [{ slug: "OwnerHandle" }] },
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("set_active_from_existing_list");
		expect(state.setActiveCalls).toEqual(["ownerhandle"]);
		expect(state.addCalls).toEqual([]);
		expect(state.active).toBe("ownerhandle");
	});

	it("own channel yeni -> hem add hem set active (added_and_set_active)", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			initialChannels: [],
			ownChannelsResponse: { data: [{ slug: "BrandNew" }] },
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("added_and_set_active");
		expect(state.addCalls).toEqual(["brandnew"]);
		expect(state.setActiveCalls).toEqual(["brandnew"]);
		expect(state.channels).toEqual([{ slug: "brandnew", autoConnect: true }]);
	});

	it("getAuthStatus reject -> treat as disconnected (no throw, no mutation)", async () => {
		const { deps, state } = buildDeps({ authReject: true });
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_oauth_disconnected");
		expect(state.setActiveCalls).toEqual([]);
	});

	it("getOwnChannels reject -> treat as no own channels", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			ownChannelsReject: true,
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_no_own_channels");
		expect(state.setActiveCalls).toEqual([]);
		expect(state.addCalls).toEqual([]);
	});

	it("response.data null/undefined toleransi", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			ownChannelsResponse: undefined,
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("skipped_no_own_channels");
		expect(state.setActiveCalls).toEqual([]);
	});

	it("first own slug bos string -> sonraki gecerli slug'a duser", async () => {
		const { deps, state } = buildDeps({
			authConnected: true,
			ownChannelsResponse: { data: [{ slug: "   " }, { slug: "valid-one" }] },
		});
		const outcome = await bootstrapDefaultOwnChannel(deps);
		expect(outcome).toBe("added_and_set_active");
		expect(state.addCalls).toEqual(["valid-one"]);
	});
});
