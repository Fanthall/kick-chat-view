import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./App";
import "./App.css";
import Store from "./store/store";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);
root.render(
	<Provider store={Store}>
		<App />
	</Provider>
);

// calling IPC exposed from preload script
window.electron.ipcRenderer.once("ipc-example", (arg) => {
	// eslint-disable-next-line no-console
});
window.electron.ipcRenderer.sendMessage("ipc-example", ["ping"]);
