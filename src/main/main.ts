/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import { BrowserWindow, app, ipcMain, shell } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import path from "path";
import {
	acceptKickChannelRewardRedemptions,
	banKickUser,
	connectKick,
	deleteKickChatMessage,
	deleteKickEventSubscriptions,
	disconnectKick,
	getKickAuthStatus,
	getKickCategoryById,
	getKickChannelRewardRedemptions,
	getKickChannelRewards,
	getKickChannelBySlug,
	getKickKicksLeaderboard,
	getKickLivestreams,
	getKickOwnChannels,
	getKickStoredConfig,
	getKickUsers,
	listKickEventSubscriptions,
	patchKickChannel,
	refreshKick,
	rejectKickChannelRewardRedemptions,
	searchKickCategories,
	sendKickChatMessage,
	subscribeKickEvents,
	timeoutKickUser,
	unbanKickUser,
} from "./kickService";
import type { UserWindowPayload } from "../shared/userWindow";
import type { PanelWindowPayload, PanelKind } from "../shared/panelWindow";
import MenuBuilder from "./menu";
import { resolveHtmlPath } from "./util";

class AppUpdater {
	constructor() {
		log.transports.file.level = "info";
		autoUpdater.logger = log;
		// Sprint 61: Manuel akış — kullanıcı butona basana kadar indirme yok.
		// Background'da sadece versiyon kontrolü yapılır, event'ler renderer'a
		// forward edilir (wireAutoUpdater main process IPC handler'larında).
		autoUpdater.autoDownload = false;
		autoUpdater.autoInstallOnAppQuit = true;
		autoUpdater.checkForUpdates().catch((err) => {
			log.warn("auto-update check skipped:", err?.message ?? err);
		});
	}
}

let mainWindow: BrowserWindow | null = null;

const userWindows = new Map<string, BrowserWindow>();
const userWindowPayloads = new Map<string, UserWindowPayload>();
let kickConnectionWindow: BrowserWindow | null = null;

/** Sprint 14 — one pop-out per panel kind. */
const panelWindows = new Map<PanelKind, BrowserWindow>();

const sendUserWindowPayload = (key: string) => {
	const userWindow = userWindows.get(key);
	const payload = userWindowPayloads.get(key);
	if (!userWindow || userWindow.isDestroyed() || !payload) return;

	userWindow.webContents.send("user-window:payload", payload);
};

const createUserWindow = (payload: UserWindowPayload) => {
	const existingWindow = userWindows.get(payload.key);
	if (existingWindow && !existingWindow.isDestroyed()) {
		existingWindow.focus();
		userWindowPayloads.set(payload.key, payload);
		sendUserWindowPayload(payload.key);
		return;
	}

	const userWindow = new BrowserWindow({
		show: false,
		width: 560,
		height: 720,
		minWidth: 420,
		minHeight: 520,
		parent: mainWindow ?? undefined,
		webPreferences: {
			preload: app.isPackaged
				? path.join(__dirname, "preload.js")
				: path.join(__dirname, "../../.erb/dll/preload.js"),
		},
	});

	userWindows.set(payload.key, userWindow);
	userWindowPayloads.set(payload.key, payload);
	userWindow.loadURL(`${resolveHtmlPath("index.html")}#/user-window`);

	userWindow.webContents.on("did-finish-load", () => {
		sendUserWindowPayload(payload.key);
	});

	userWindow.on("ready-to-show", () => {
		userWindow.show();
		userWindow.focus();
	});

	userWindow.on("closed", () => {
		userWindows.delete(payload.key);
		userWindowPayloads.delete(payload.key);
		// Sprint 27: child window kapaninca ana pencere fokusu kaybetmesin.
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.focus();
		}
	});
};

const createKickConnectionWindow = () => {
	if (kickConnectionWindow && !kickConnectionWindow.isDestroyed()) {
		kickConnectionWindow.focus();
		return;
	}

	kickConnectionWindow = new BrowserWindow({
		show: false,
		width: 620,
		height: 720,
		minWidth: 500,
		minHeight: 560,
		parent: mainWindow ?? undefined,
		webPreferences: {
			preload: app.isPackaged
				? path.join(__dirname, "preload.js")
				: path.join(__dirname, "../../.erb/dll/preload.js"),
		},
	});

	kickConnectionWindow.loadURL(
		`${resolveHtmlPath("index.html")}#/kick-connection`
	);

	kickConnectionWindow.on("ready-to-show", () => {
		kickConnectionWindow?.show();
		kickConnectionWindow?.focus();
	});

	kickConnectionWindow.on("closed", () => {
		kickConnectionWindow = null;
		// Sprint 27: kapaninca ana pencereyi one cikar
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.focus();
		}
	});
};

ipcMain.on("ipc-example", async (event, arg) => {
	const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
	console.log(msgTemplate(arg));
	event.reply("ipc-example", msgTemplate("pong"));
});

ipcMain.handle("kick:get-auth-status", () => {
	return getKickAuthStatus();
});

ipcMain.handle("kick:get-stored-config", () => {
	return getKickStoredConfig();
});

ipcMain.handle("kick:connect", (_event, request) => {
	return connectKick(request);
});

ipcMain.handle("kick:disconnect", () => {
	return disconnectKick();
});

ipcMain.handle("kick:refresh", () => {
	return refreshKick();
});

ipcMain.handle("kick:get-channel-by-slug", (_event, slug: string) => {
	return getKickChannelBySlug(slug);
});

ipcMain.handle("kick:patch-channel", (_event, request) => {
	return patchKickChannel(request);
});

ipcMain.handle(
	"kick:search-categories",
	(_event, query: string, limit?: number) => {
		return searchKickCategories(query, limit);
	}
);

ipcMain.handle("kick:get-category-by-id", (_event, id: number) => {
	return getKickCategoryById(id);
});

ipcMain.handle("kick:get-own-channels", () => {
	return getKickOwnChannels();
});

ipcMain.handle("kick:get-users", (_event, ids?: number[]) => {
	return getKickUsers(ids);
});

ipcMain.handle("kick:get-livestreams", (_event, broadcasterUserIds?: number[]) => {
	return getKickLivestreams(broadcasterUserIds);
});

ipcMain.handle("kick:send-chat-message", (_event, request) => {
	return sendKickChatMessage(request);
});

ipcMain.handle("kick:delete-chat-message", (_event, messageId: string) => {
	return deleteKickChatMessage(messageId);
});

ipcMain.handle("kick:ban-user", (_event, request) => {
	return banKickUser(request);
});

ipcMain.handle("kick:timeout-user", (_event, request) => {
	return timeoutKickUser(request);
});

ipcMain.handle("kick:unban-user", (_event, request) => {
	return unbanKickUser(request);
});

ipcMain.handle("kick:list-event-subscriptions", (_event, broadcasterUserId?: number) => {
	return listKickEventSubscriptions(broadcasterUserId);
});

ipcMain.handle("kick:subscribe-to-events", (_event, request) => {
	return subscribeKickEvents(request);
});

ipcMain.handle("kick:delete-event-subscriptions", (_event, ids: string[]) => {
	return deleteKickEventSubscriptions(ids);
});

ipcMain.handle("kick:get-channel-rewards", () => {
	return getKickChannelRewards();
});

ipcMain.handle("kick:get-channel-reward-redemptions", (_event, request) => {
	return getKickChannelRewardRedemptions(request);
});

ipcMain.handle("kick:accept-channel-reward-redemptions", (_event, ids: string[]) => {
	return acceptKickChannelRewardRedemptions(ids);
});

ipcMain.handle("kick:reject-channel-reward-redemptions", (_event, ids: string[]) => {
	return rejectKickChannelRewardRedemptions(ids);
});

ipcMain.handle("kick:get-kicks-leaderboard", (_event, top?: number) => {
	return getKickKicksLeaderboard(top);
});

ipcMain.handle("user-window:open", (_event, payload: UserWindowPayload) => {
	createUserWindow(payload);
});

/**
 * Sprint 16 fix: popup-side "ready" signal. The React UserWindow component
 * sends this once it has registered its onPayload listener; we reply by
 * re-sending the stored payload. This replaces the unreliable did-finish-load
 * → send race where the IPC message could arrive before React mounted.
 */
ipcMain.on("user-window:ready", (event) => {
	const sender = event.sender;
	for (const [key, win] of userWindows.entries()) {
		if (!win.isDestroyed() && win.webContents.id === sender.id) {
			const payload = userWindowPayloads.get(key);
			if (payload) {
				sender.send("user-window:payload", payload);
			}
			return;
		}
	}
});

ipcMain.handle("user-window:update", (_event, payload: UserWindowPayload) => {
	const existingWindow = userWindows.get(payload.key);
	if (!existingWindow || existingWindow.isDestroyed()) return;
	userWindowPayloads.set(payload.key, payload);
	sendUserWindowPayload(payload.key);
});

ipcMain.handle("user-window:close", (_event, key: string) => {
	const existingWindow = userWindows.get(key);
	if (existingWindow && !existingWindow.isDestroyed()) {
		existingWindow.close();
	}
	userWindows.delete(key);
	userWindowPayloads.delete(key);
});

ipcMain.handle("kick-connection-window:open", () => {
	createKickConnectionWindow();
});

// ─── Sprint 14: Panel pop-out windows ────────────────────────────────────────

const createPanelWindow = (panel: PanelKind) => {
	const existing = panelWindows.get(panel);
	if (existing && !existing.isDestroyed()) {
		existing.focus();
		return;
	}

	const titles: Record<PanelKind, string> = {
		activity: "Activity — Kick Chat Viewer",
		moderation: "Moderation — Kick Chat Viewer",
	};

	const panelWindow = new BrowserWindow({
		show: false,
		width: 480,
		height: 720,
		minWidth: 360,
		minHeight: 520,
		title: titles[panel],
		parent: mainWindow ?? undefined,
		webPreferences: {
			preload: app.isPackaged
				? path.join(__dirname, "preload.js")
				: path.join(__dirname, "../../.erb/dll/preload.js"),
		},
	});

	panelWindows.set(panel, panelWindow);

	// Reuse same index.html with a dedicated hash route.
	panelWindow.loadURL(
		`${resolveHtmlPath("index.html")}#/${panel}-window`
	);

	panelWindow.on("ready-to-show", () => {
		panelWindow.show();
		panelWindow.focus();
	});

	panelWindow.on("closed", () => {
		panelWindows.delete(panel);
		// Sprint 27: kapaninca ana pencereyi one cikar.
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.focus();
		}
	});
};

ipcMain.handle("panel-window:open", (_event, panel: PanelKind) => {
	createPanelWindow(panel);
});

/**
 * Relay: main renderer sends a snapshot payload; main process forwards it
 * to the matching pop-out window (if open).
 *
 * Channel: "panel-window:send-payload"  (renderer → main → pop-out)
 */
ipcMain.handle("panel-window:send-payload", (_event, payload: PanelWindowPayload) => {
	const win = panelWindows.get(payload.panel);
	if (!win || win.isDestroyed()) return;
	win.webContents.send("panel-window:payload", payload);
});

/**
 * Relay: pop-out renderer requests a fresh snapshot from the main renderer.
 *
 * Channel: "panel-window:request-payload"  (pop-out → main → main renderer)
 * Main renderer listens for "panel-window:refresh-request" and responds by
 * calling panelWindow.sendPayload() from the renderer side.
 */
ipcMain.on("panel-window:request-payload", (_event, panel: PanelKind) => {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("panel-window:refresh-request", panel);
	}
});

/**
 * Sprint 37: pop-out → main "clear mod target" relay. Pop-out içindeki
 * Mod target kartında X butonuna basılınca, ana renderer'ın da
 * selectedModUser state'ini sıfırlaması için olay forward edilir.
 */
ipcMain.on("panel-window:clear-mod-target", () => {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("panel-window:mod-target-cleared");
	}
});

/* Sprint 47: Webhook receiver kaldırıldı (Pusher chatroom + channel_<id>
   tüm event'leri sağlıyor). webhookServer.ts dosyası silindi; IPC
   handler / auto-start / quit hook'lar artık gereksiz. */

// Sprint 52: open-external — UserWindow rol butonları Kick kanal sayfasını
// varsayılan tarayıcıda açabilsin diye (mod/VIP/OG komutu için).
ipcMain.handle("open-external", async (_e, url: string) => {
	if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
	try {
		await shell.openExternal(url);
		return true;
	} catch (err) {
		console.log("open-external failed", err);
		return false;
	}
});

// Sprint 53: GitHub Releases check (public repo).
import { fetchLatestRelease, compareVersions } from "./githubUpdate";

ipcMain.handle(
	"update:check",
	async (_e, tokenOverride?: string) => {
		const current = app.getVersion();
		const latest = await fetchLatestRelease(tokenOverride);
		if (!latest) {
			return { ok: false, reason: "token-or-network", current };
		}
		const cmp = compareVersions(latest.version, current);
		return {
			ok: true,
			current,
			latest,
			updateAvailable: cmp > 0,
		};
	}
);

// Sprint 61: electron-updater event forwarder + manual download/install IPC.
// app.whenReady() içinde call edilir, çünkü main window'a event forward etmek gerek.
let autoUpdaterWired = false;
const wireAutoUpdater = () => {
	if (autoUpdaterWired) return;
	autoUpdaterWired = true;
	// Manuel kontrol modu — checkForUpdatesAndNotify yerine sadece check
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;
	const forward = (channel: string, payload: any) => {
		BrowserWindow.getAllWindows().forEach((w) => {
			if (!w.isDestroyed()) {
				w.webContents.send(channel, payload);
			}
		});
	};
	autoUpdater.on("checking-for-update", () => forward("update:event", { kind: "checking" }));
	autoUpdater.on("update-available", (info) =>
		forward("update:event", { kind: "available", version: info.version, releaseDate: info.releaseDate, releaseNotes: info.releaseNotes })
	);
	autoUpdater.on("update-not-available", (info) =>
		forward("update:event", { kind: "not-available", version: info?.version })
	);
	autoUpdater.on("error", (err) =>
		forward("update:event", { kind: "error", message: err?.message ?? String(err) })
	);
	autoUpdater.on("download-progress", (p) =>
		forward("update:event", {
			kind: "progress",
			percent: p.percent,
			transferred: p.transferred,
			total: p.total,
			bytesPerSecond: p.bytesPerSecond,
		})
	);
	autoUpdater.on("update-downloaded", (info) =>
		forward("update:event", { kind: "downloaded", version: info.version })
	);
};

ipcMain.handle("update:auto-check", async () => {
	wireAutoUpdater();
	try {
		const res = await autoUpdater.checkForUpdates();
		return {
			ok: true,
			version: res?.updateInfo?.version,
			downloadPromise: !!res?.downloadPromise,
		};
	} catch (err: any) {
		return { ok: false, message: err?.message ?? String(err) };
	}
});

ipcMain.handle("update:download", async () => {
	wireAutoUpdater();
	try {
		// Sprint 61 fix: electron-updater downloadUpdate() öncesi
		// checkForUpdates() cache'inin hazır olmasını gerektirir
		// (yoksa "Please check update first" hatası). App açılışındaki
		// background check henüz tamamlanmamış olabilir → burada
		// garantili tekrar çağır.
		await autoUpdater.checkForUpdates();
		await autoUpdater.downloadUpdate();
		return { ok: true };
	} catch (err: any) {
		return { ok: false, message: err?.message ?? String(err) };
	}
});

ipcMain.handle("update:install", async () => {
	wireAutoUpdater();
	try {
		// isSilent=false: NSIS UI gösterir; isForceRunAfter=true: kurulduktan sonra app açar
		autoUpdater.quitAndInstall(false, true);
		return { ok: true };
	} catch (err: any) {
		return { ok: false, message: err?.message ?? String(err) };
	}
});

if (process.env.NODE_ENV === "production") {
	const sourceMapSupport = require("source-map-support");
	sourceMapSupport.install();
}

const isDebug =
	process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true";

if (isDebug) {
	require("electron-debug")();
}

const installExtensions = async () => {
	const installer = require("electron-devtools-installer");
	const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
	const extensions = ["REACT_DEVELOPER_TOOLS"];

	return installer
		.default(
			extensions.map((name) => installer[name]),
			forceDownload
		)
		.catch(console.log);
};

const createWindow = async () => {
	if (isDebug) {
		await installExtensions();
	}

	const RESOURCES_PATH = app.isPackaged
		? path.join(process.resourcesPath, "assets")
		: path.join(__dirname, "../../assets");

	const getAssetPath = (...paths: string[]): string => {
		return path.join(RESOURCES_PATH, ...paths);
	};

	mainWindow = new BrowserWindow({
		show: false,
		width: 1600,
		height: 728,
		minWidth: 700,
		minHeight: 350,
		fullscreen: false,
		icon: getAssetPath("logo.png"),
		webPreferences: {
			preload: app.isPackaged
				? path.join(__dirname, "preload.js")
				: path.join(__dirname, "../../.erb/dll/preload.js"),
		},
	});

	mainWindow.loadURL(resolveHtmlPath("index.html"));

	mainWindow.on("ready-to-show", () => {
		if (!mainWindow) {
			throw new Error('"mainWindow" is not defined');
		}
		if (process.env.START_MINIMIZED) {
			mainWindow.minimize();
		} else {
			mainWindow.show();
		}
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	const menuBuilder = new MenuBuilder(mainWindow);
	menuBuilder.buildMenu();

	// Open urls in the user's browser
	mainWindow.webContents.setWindowOpenHandler((edata) => {
		shell.openExternal(edata.url);
		return { action: "deny" };
	});

	// Remove this if your app does not use auto updates
	// eslint-disable-next-line
	new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on("window-all-closed", () => {
	// Respect the OSX convention of having the application in memory even
	// after all windows have been closed
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.whenReady()
	.then(() => {
		createWindow();
		app.on("activate", () => {
			// On macOS it's common to re-create a window in the app when the
			// dock icon is clicked and there are no other windows open.
			if (mainWindow === null) createWindow();
		});
	})
	.catch(console.log);
