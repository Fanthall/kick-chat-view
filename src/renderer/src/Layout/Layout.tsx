import { Button } from "@nextui-org/react";
import React, { FunctionComponent, useEffect, useState } from "react";
import { IoSettings } from "react-icons/io5";
import { fetchGitHubData } from "../../services/githubAccessHandle";
import { getChannelData } from "../../services/kick";
import Chat from "../Chat/Chat";
import ModActions from "../ModActions/ModActions";
import Settings from "../Settings/Settings";
import SubView from "../SubView/SubView";

enum Screens {
	Settings,
	Chat,
}
const Layout: FunctionComponent = () => {
	const [channelName, setChannelName] = useState<string>("");
	const [streamTitle, setStreamTitle] = useState<string>("Not lives");
	const [streamCategory, setStreamCategory] = useState<string>("");
	const [screen, setScreen] = useState<Screens>(Screens.Chat);
	const [intervalValue, setIntervalValue] = useState<any>();
	useEffect(() => {
		const channelName = localStorage.getItem("channelName");
		if (channelName) setChannelName(channelName);
	}, []);
	useEffect(() => {
		clearInterval(intervalValue);
		const interval = setInterval(() => {
			console.log(channelName);
			if (channelName !== "")
				getChannelData(channelName).then((res) => {
					if (res.data.livestream) {
						setStreamTitle(
							(prev) => "Title: " + res.data["livestream"].session_title
						);
						setStreamCategory(
							(prev) =>
								"Game: " + res.data["livestream"].categories[0].name
						);
					} else {
						setStreamTitle("Not live");
					}
				});
		}, 60000);
		setIntervalValue(interval);
	}, [channelName]);
	useEffect(() => {
		fetchGitHubData();
	}, []);
	return (
		<div className="flex flex-col justify-start items-start w-full h-full">
			<div className="flex flex-row justify-between items-center w-full h-[6%] mt-2 mb-1 ">
				<div style={{ paddingLeft: 15 }}>
					{screen === Screens.Chat && streamTitle}
					<br /> {screen === Screens.Chat && streamCategory}
				</div>
				<Button
					size="sm"
					variant="light"
					onPress={() => {
						setScreen(
							Screens.Settings === screen
								? Screens.Chat
								: Screens.Settings
						);
					}}
				>
					<IoSettings size={22} />
				</Button>
			</div>
			{screen === Screens.Chat && (
				<div className="flex flex-row justify-start items-start w-full h-[93%]">
					<div
						className="h-full mt-2"
						style={{
							width: "calc(100% - 900px)",
						}}
					>
						<Chat />
					</div>
					<div
						className="h-[97%] ml-2 mt-2 border border-solid border-default-200 flex flex-col justify-start items-center p-2"
						style={{
							minWidth: "400px",
							width: "450px",
						}}
					>
						<SubView />
					</div>
					<div
						className="h-[97%]   ml-2 mt-2 border border-solid border-default-200 flex flex-col justify-start items-center p-2"
						style={{
							minWidth: "400px",
							width: "450px",
						}}
					>
						<ModActions />
					</div>
				</div>
			)}
			{screen === Screens.Settings && (
				<div className="flex flex-row justify-start items-start w-full h-[93%]">
					<div className="w-full h-[93%]">
						<Settings />
					</div>
				</div>
			)}
		</div>
	);
};
export default Layout;
