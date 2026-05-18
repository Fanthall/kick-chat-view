import { NextUIProvider } from "@nextui-org/react";
import React, { useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./dist/output.css";
import { EmoteSet } from "./constants/emote";
import { getBttvGlobalEmotes } from "./services/bttv";
import { getFfzGlobalSets } from "./services/ffz";
import { getEmote, getSevenTvGlobalSet } from "./services/sevenTv";
import KickConnection from "./src/KickConnection/KickConnection";
import Layout from "./src/Layout/Layout";
import UserWindow from "./src/UserWindow/UserWindow";
import MessageActionsFunc from "./store/actions/chatMessage";
import { useFanthalDispatch } from "./store/hooks/hooks";
import {
	getChannelList,
	getActiveChannelSlug,
	setActiveChannelSlug,
} from "./util/channelSettings";
import { chatListener } from "./util/chatConnection";
import {
	normalizeBttvGlobal,
	normalizeFfzSet,
	normalizeSevenTvSet,
} from "./util/emoteIndex";
export default function App() {
	const dispatch = useFanthalDispatch();
	const isUserWindow = window.location.hash.startsWith("#/user-window");
	const isKickConnection = window.location.hash.startsWith("#/kick-connection");
	useEffect(() => {
		if (isUserWindow || isKickConnection) return;
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

		const channels = getChannelList();
		const activeChannel = getActiveChannelSlug();
		if (!activeChannel && channels[0]) {
			setActiveChannelSlug(channels[0].slug);
		}
		channels
			.filter((channel) => channel.autoConnect)
			.forEach((channel) => dispatch(chatListener(channel.slug)));
	}, [isUserWindow, isKickConnection]);

	return (
		<NextUIProvider
			className="w-full h-full"
			style={{
				overflow: "hidden",
				backgroundColor: "transparent",
			}}
		>
			<main
				className="dark text-foreground bg-background w-full h-full"
				style={{
					backgroundColor: "transparent",
					overflowY: "scroll",
					paddingRight: 17 /* Increase/decrease this value for cross-browser compatibility */,
					boxSizing: "content-box" /* So the width will be 100% + 17px */,
				}}
			>
				<div className="flex justify-start items-center flex-col w-full h-full">
					<div className="w-[98%] h-[98%]">
						{isUserWindow ? (
							<UserWindow />
						) : isKickConnection ? (
							<KickConnection />
						) : (
							<Layout />
						)}
					</div>
				</div>
			</main>
			<ToastContainer
				autoClose={4500}
				closeOnClick
				pauseOnFocusLoss={false}
				pauseOnHover
			/>
		</NextUIProvider>
	);
}
