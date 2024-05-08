import { NextUIProvider } from "@nextui-org/react";
import { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./dist/output.css";
import { getEmote } from "./services/sevenTv";
import Layout from "./src/Layout/Layout";
import MessageActionsFunc from "./store/actions/chatMessage";
import { useFanthalDispatch } from "./store/hooks/hooks";
import { chatListener } from "./util/chatConnection";
export default function App() {
	const dispatch = useFanthalDispatch();
	const [subWindow, setSubWindow] = useState<boolean>(false);
	useEffect(() => {
		// TODO: sağ üstte ayarlardan eklenecek
		localStorage.setItem("userName", "Fanthal");
		dispatch(chatListener());
		getEmote()
			.then((res) => {
				dispatch(MessageActionsFunc.setSevenTvEmotes(res.data.emotes));
			})
			.catch((err) => {});
	}, []);
	window.electron.ipcRenderer.once("open-user-detail", (arg) => {
		console.log("open-user-detail: ", arg);
		setSubWindow(true);
	});
	if (subWindow) {
		return <div>test</div>;
	}

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
						<Layout />
					</div>
				</div>
			</main>
			<ToastContainer autoClose={60000} pauseOnHover />
		</NextUIProvider>
	);
}
