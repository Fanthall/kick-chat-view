import { NextUIProvider } from "@nextui-org/react";
import React, { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./dist/output.css";
import { EmoteSet } from "./constants/emote";
import { getBttvGlobalEmotes } from "./services/bttv";
import { getFfzGlobalSets } from "./services/ffz";
import { getEmote, getSevenTvGlobalSet } from "./services/sevenTv";
import KickConnection from "./src/KickConnection/KickConnection";
import Layout from "./src/Layout/Layout";
import LayoutModern from "./src/Layout/LayoutModern";
import UserWindow from "./src/UserWindow/UserWindow";
import ActivityWindowShell from "./src/ActivityView/ActivityWindowShell";
import ModerationWindowShell from "./src/ModActions/ModerationWindowShell";
import MessageActionsFunc from "./store/actions/chatMessage";
import { useFanthalDispatch } from "./store/hooks/hooks";
import {
	getChannelList,
	getActiveChannelSlug,
	setActiveChannelSlug,
	addChannel,
} from "./util/channelSettings";
import { bootstrapDefaultOwnChannel } from "./util/defaultChannelBootstrap";
import { chatListener } from "./util/chatConnection";
import {
	normalizeBttvGlobal,
	normalizeFfzSet,
	normalizeSevenTvSet,
} from "./util/emoteIndex";

// Sprint 7 — Shell preference resolution.
// Priority: URL param > localStorage explicit > default (modern).
// Legacy key migration: chatViewShellPreview → chatViewShellPreference.
function getShellPreference(): "classic" | "modern" {
	try {
		// URL override (highest priority) — works for both search params and hash routing
		if (typeof window !== "undefined") {
			const url = new URL(window.location.href);
			const param = url.searchParams.get("shell");
			if (param === "classic" || param === "modern") return param;
			// Hash routing param (Electron file:// often uses hash)
			const hash = window.location.hash || "";
			if (hash.includes("shell=classic")) return "classic";
			if (hash.includes("shell=modern")) return "modern";
		}
		// localStorage explicit override
		const stored = localStorage.getItem("chatViewShellPreference");
		if (stored === "classic") return "classic";
		if (stored === "modern") return "modern";
	} catch {
		// noop — safe fallback
	}
	// Default: modern (flipped in Sprint 7; was classic)
	return "modern";
}

export default function App() {
	const dispatch = useFanthalDispatch();
	const isUserWindow = window.location.hash.startsWith("#/user-window");
	const isKickConnection = window.location.hash.startsWith("#/kick-connection");
	// Sprint 14: panel pop-out windows reuse the same index.html entry.
	const isActivityWindow = window.location.hash.startsWith("#/activity-window");
	const isModerationWindow = window.location.hash.startsWith("#/moderation-window");
	const [shellPreference, setShellPreference] = useState<"classic" | "modern">(
		getShellPreference
	);
	const useModernShell = shellPreference === "modern";
	useEffect(() => {
		// Sprint 7 — Migrate legacy key chatViewShellPreview → chatViewShellPreference
		try {
			const legacy = localStorage.getItem("chatViewShellPreview");
			if (legacy && !localStorage.getItem("chatViewShellPreference")) {
				localStorage.setItem("chatViewShellPreference", legacy);
				localStorage.removeItem("chatViewShellPreview");
			}
		} catch {
			// noop
		}
	}, []);
	// Listen for shell preference changes dispatched by SettingsModern Advanced toggle
	useEffect(() => {
		const handleShellChange = () => {
			setShellPreference(getShellPreference());
		};
		window.addEventListener("chat-view-shell-preference-changed", handleShellChange);
		return () => {
			window.removeEventListener("chat-view-shell-preference-changed", handleShellChange);
		};
	}, []);
	// Sprint 16: when modern shell is active, mark <html>+<body> with a class
	// so CSS can drop the classic body padding/gradient frame reliably (the
	// :has() selector fallback works on modern Chromium but isn't guaranteed
	// across the popup windows / older Electron contexts).
	useEffect(() => {
		const html = document.documentElement;
		const body = document.body;
		if (useModernShell) {
			html.classList.add("modern-shell-root");
			body.classList.add("modern-shell-root");
		} else {
			html.classList.remove("modern-shell-root");
			body.classList.remove("modern-shell-root");
		}
		return () => {
			html.classList.remove("modern-shell-root");
			body.classList.remove("modern-shell-root");
		};
	}, [useModernShell]);

	// Sprint 20: theme + language preferences applied as data-attributes on
	// <html>, <body>, and the modern shell root. CSS reacts via
	// [data-theme="light"] selectors; i18n hook reads document.documentElement
	// dataset.lang. Both persist to localStorage; SettingsModern dispatches
	// change events to keep this in sync without a reload.
	useEffect(() => {
		const apply = () => {
			const theme =
				(localStorage.getItem("chatViewTheme") as "light" | "dark" | null) ||
				"dark";
			const lang =
				(localStorage.getItem("chatViewLanguage") as "tr" | "en" | null) ||
				"tr";
			const html = document.documentElement;
			const body = document.body;
			html.dataset.theme = theme;
			body.dataset.theme = theme;
			html.lang = lang;
			html.dataset.lang = lang;
			body.dataset.lang = lang;
			// Tag the modern shell root too so [data-app-shell="modern"][data-theme]
			// CSS selectors match even when class isn't yet on root.
			const shellRoot = document.querySelector(
				'[data-app-shell="modern"]'
			) as HTMLElement | null;
			if (shellRoot) {
				shellRoot.dataset.theme = theme;
				shellRoot.dataset.lang = lang;
			}
		};
		apply();
		window.addEventListener("chat-view-theme-changed", apply);
		window.addEventListener("chat-view-language-changed", apply);
		return () => {
			window.removeEventListener("chat-view-theme-changed", apply);
			window.removeEventListener("chat-view-language-changed", apply);
		};
	}, [useModernShell]);
	useEffect(() => {
		if (isUserWindow || isKickConnection || isActivityWindow || isModerationWindow) return;
		// TODO: sağ üstte ayarlardan eklenecek
		//localStorage.setItem("userName", "Fanthal");
		getEmote()
			.then((res) => {
				dispatch(MessageActionsFunc.setSevenTvEmotes(res.data.emotes));
			})
			.catch((err) => {});

		Promise.allSettled([
			getSevenTvGlobalSet(),
			getBttvGlobalEmotes(),
			getFfzGlobalSets(),
		]).then(([sevenTvRes, bttvRes, ffzRes]) => {
			const sets: EmoteSet[] = [];
			if (sevenTvRes.status === "fulfilled") {
				const set = normalizeSevenTvSet(sevenTvRes.value.data, {
					provider: "seventv-global",
					scope: "global",
					nameOverride: "7TV Global",
				});
				if (set.emotes.length) sets.push(set);
			}
			if (bttvRes.status === "fulfilled") {
				const set = normalizeBttvGlobal(bttvRes.value.data || []);
				if (set.emotes.length) sets.push(set);
			}
			if (ffzRes.status === "fulfilled") {
				const data = ffzRes.value.data;
				const defaults = data?.default_sets || [];
				const setMap = data?.sets || {};
				const ffzSets = (defaults.length
					? defaults
					: Object.keys(setMap).map((key) => Number(key)).filter((n) => !Number.isNaN(n))
				)
					.map((id) => setMap[String(id)])
					.filter(Boolean)
					.map((ffzSet) =>
						normalizeFfzSet(ffzSet, {
							provider: "ffz-global",
							scope: "global",
						})
					)
					.filter((set) => set.emotes.length);
				sets.push(...ffzSets);
			}
			dispatch(MessageActionsFunc.setGlobalEmoteSets(sets));
		});

		// REQ-2: OAuth-connected ve manuel active channel yoksa own channel'i default sec.
		// Manuel secim (chatViewActiveChannel) varsa dokunulmaz.
		bootstrapDefaultOwnChannel({
			getAuthStatus: () => window.electron.kick.getAuthStatus(),
			getOwnChannels: () => window.electron.kick.getOwnChannels(),
			getActiveChannelSlug,
			getChannelList,
			setActiveChannelSlug,
			addChannel,
		})
			.catch(() => undefined)
			.finally(() => {
				const channels = getChannelList();
				const activeChannel = getActiveChannelSlug();
				if (!activeChannel && channels[0]) {
					setActiveChannelSlug(channels[0].slug);
				}
				channels
					.filter((channel) => channel.autoConnect)
					.forEach((channel) => dispatch(chatListener(channel.slug)));
			});
	}, [isUserWindow, isKickConnection]);

	// Sprint 42: webhook receiver çalışıyorsa + publicUrl set ise + ilgili
	// event'lere subscribe değilsek otomatik subscribe et. Pop-out'larda
	// çalışmaz. Subscription ID'leri localStorage'a persist edilir.
	useEffect(() => {
		if (
			isUserWindow ||
			isActivityWindow ||
			isModerationWindow ||
			isKickConnection
		) {
			return;
		}
		const tryAutoSubscribe = async () => {
			try {
				const webhook = (window.electron as any)?.webhook;
				if (!webhook) return;
				const info = await webhook.getReceiverInfo?.();
				const running = info?.running;
				const publicUrl = localStorage.getItem(
					"chatViewWebhookPublicUrl"
				);
				if (!running || !publicUrl) return;
				const flagKey = "chatViewWebhookAutoSubscribed";
				if (localStorage.getItem(flagKey) === "true") return;
				// Subscribe edilecek event listesi.
				const events: { name: string; version: number }[] = [
					{ name: "kicks.gifted", version: 1 },
					{ name: "channel.subscription.new", version: 1 },
					{ name: "channel.subscription.renewal", version: 1 },
					{ name: "channel.subscription.gifts", version: 1 },
				];
				// Follow toggle açıksa channel.followed da subscribe et.
				if (
					localStorage.getItem("chatViewShowFollowers") !== "false"
				) {
					events.push({ name: "channel.followed", version: 1 });
				}
				const res: any = await window.electron.kick.subscribeToEvents({
					events,
					method: "webhook",
				} as any);
				const newIds: string[] = (res?.data || [])
					.map((d: any) => d?.subscription_id || d?.id)
					.filter(Boolean);
				const existingRaw = localStorage.getItem(
					"chatViewWebhookSubscriptionIds"
				);
				let existing: string[] = [];
				try {
					existing = existingRaw ? JSON.parse(existingRaw) : [];
				} catch {
					/* ignore */
				}
				const merged = Array.from(new Set([...existing, ...newIds]));
				localStorage.setItem(
					"chatViewWebhookSubscriptionIds",
					JSON.stringify(merged)
				);
				localStorage.setItem(flagKey, "true");
				console.log(
					"[webhook auto-subscribe] success",
					events.map((e) => e.name).join(", "),
					"ids:",
					newIds.length
				);
			} catch (err) {
				console.log("[webhook auto-subscribe] failed", err);
			}
		};
		// Bekle: receiver bilgisi async, publicUrl localStorage'tan sync ama
		// kullanıcı henüz girmemiş olabilir. 2 sn sonra dene; başarısızsa
		// kullanıcı Settings'ten manuel başlatır.
		const timer = setTimeout(tryAutoSubscribe, 2000);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUserWindow, isActivityWindow, isModerationWindow, isKickConnection]);

	// Sprint 40: webhook event listener (kicks.gifted vb.) — yalnız ana pencere.
	useEffect(() => {
		if (
			isUserWindow ||
			isActivityWindow ||
			isModerationWindow ||
			isKickConnection
		) {
			return;
		}
		const unsub = (window.electron as any)?.webhook?.onEvent?.(
			(event: {
				eventType: string;
				messageId: string;
				timestamp: string;
				payload: any;
				verified: boolean;
			}) => {
				try {
					const eventType = event.eventType || "";
					const slug =
						event.payload?.broadcaster?.channel_slug ||
						event.payload?.channel?.slug ||
						event.payload?.channel_slug ||
						getActiveChannelSlug() ||
						undefined;
					if (eventType === "channel.followed") {
						// Sprint 41: takipçi event'i
						if (localStorage.getItem("chatViewShowFollowers") === "false") {
							return;
						}
						const followerName: string =
							event.payload?.user?.username ||
							event.payload?.follower?.username ||
							event.payload?.username ||
							"Anonim";
						const createdAt = Date.now();
						const id = `follow-${followerName}-${event.messageId || createdAt}`;
						// eslint-disable-next-line @typescript-eslint/no-var-requires
						const {
							addActivity,
							newMessage,
						} = require("./store/actions/chatMessage");
						dispatch(
							addActivity({
								id,
								channelSlug: slug,
								kind: "follow",
								actor: { username: followerName },
								username: followerName,
								createdAt,
								create_at: createdAt,
								raw: event.payload,
							})
						);
						dispatch(
							newMessage({
								id: `follow-banner-${id}`,
								channelSlug: slug,
								chatroom_id: 0,
								content: `${followerName} kanalı takip etti`,
								type: "follow-banner",
								created_at: new Date(createdAt).toISOString(),
								sender: {
									id: 0,
									username: followerName,
									slug: followerName.toLowerCase(),
									identity: { color: "#22d3ee", badges: [] },
								},
							})
						);
						return;
					}
					if (eventType === "kicks.gifted") {
						// eslint-disable-next-line @typescript-eslint/no-var-requires
						const { normalizeKickWebhookActivity } = require("./util/kickActivity");
						const item = normalizeKickWebhookActivity(eventType, {
							...event.payload,
							channel: { slug },
						});
						if (item) {
							// eslint-disable-next-line @typescript-eslint/no-var-requires
							const {
								addActivity,
								newMessage,
							} = require("./store/actions/chatMessage");
							dispatch(addActivity({ ...item, channelSlug: slug }));
							const senderName = item.actor?.username || "Anonim";
							const giftName = item.giftName ? ` — ${item.giftName}` : "";
							const amount =
								item.amount != null ? `${item.amount} KICKs` : "KICKs";
							const banner = {
								id: `kicks-banner-${item.id || event.messageId}`,
								channelSlug: slug,
								chatroom_id: 0,
								content: `${senderName}, ${amount} gönderdi${giftName}`,
								type: "kicks-banner",
								created_at: new Date(
									item.createdAt || Date.now()
								).toISOString(),
								sender: {
									id: 0,
									username: senderName,
									slug: senderName.toLowerCase(),
									identity: { color: "#61a8ff", badges: [] },
								},
							};
							dispatch(newMessage(banner));
						}
					}
				} catch (err) {
					console.log("[webhook dispatch error]", err);
				}
			}
		);
		return () => unsub?.();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUserWindow, isActivityWindow, isModerationWindow, isKickConnection]);

	// Sprint 16: pop-out + modern shell pencereleri tam-bleed render edilir
	// (98% wrapper + 17px paddingRight + overflowY:scroll classic shell icindi).
	const isPopOutWindow =
		isUserWindow || isActivityWindow || isModerationWindow || isKickConnection;
	const fullBleed = isPopOutWindow || useModernShell;

	const innerView = isActivityWindow ? (
		<ActivityWindowShell />
	) : isModerationWindow ? (
		<ModerationWindowShell />
	) : isUserWindow ? (
		<UserWindow />
	) : isKickConnection ? (
		<KickConnection />
	) : useModernShell ? (
		<LayoutModern />
	) : (
		<Layout />
	);

	return (
		<NextUIProvider
			className="w-full h-full"
			style={{
				overflow: "hidden",
				backgroundColor: "transparent",
			}}
		>
			{fullBleed ? (
				<main
					className="dark text-foreground bg-background w-full h-full"
					style={{
						backgroundColor: "transparent",
						overflow: "hidden",
						margin: 0,
						padding: 0,
					}}
				>
					{innerView}
				</main>
			) : (
				<main
					className="dark text-foreground bg-background w-full h-full"
					style={{
						backgroundColor: "transparent",
						overflowY: "scroll",
						paddingRight: 17 /* classic shell scroll padding */,
						boxSizing: "content-box",
					}}
				>
					<div className="flex justify-start items-center flex-col w-full h-full">
						<div className="w-[98%] h-[98%]">{innerView}</div>
					</div>
				</main>
			)}
			<ToastContainer
				autoClose={4500}
				closeOnClick
				pauseOnFocusLoss={false}
				pauseOnHover
			/>
		</NextUIProvider>
	);
}
