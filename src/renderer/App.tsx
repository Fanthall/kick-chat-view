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
