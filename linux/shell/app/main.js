"use strict";

/**
 * Worldwide AI OS: the window the workspace opens in.
 *
 * It shows the workspace, from the address in /etc/worldwide-ai/workspace-url or, without that file, the hosted
 * workspace, and nothing else. The page gets no access to this computer: no Node.js, no preload script, no bridge, a
 * sandboxed renderer, and every permission it asks for (camera, microphone, location, notifications, anything) refused.
 * It can only move around the workspace's own address; a link anywhere else opens in the normal browser, and only if it
 * is https. Signing in, and who may use the workspace, are the workspace's own business: the window holds no account.
 *
 * When the workspace can't be reached, a page that is part of this program says so, and it tries again every 30 seconds.
 * Nothing is shown from memory.
 */

const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const HOSTED = "https://www.worldwidevapor.com/worldwide-ai";
const SETTING = "/etc/worldwide-ai/workspace-url";
const RETRY_MS = 30_000;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The workspace's address: https anywhere, or plain http only on this computer itself. */
function workspaceAddress() {
	try {
		const url = new URL(fs.readFileSync(SETTING, "utf8").trim());
		if (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname))) return url;
		console.error(`${SETTING} isn't an https address, or an http one on this computer. Using ${HOSTED}.`);
	} catch (error) {
		if (error && error.code !== "ENOENT") console.error(`${SETTING} couldn't be read. Using ${HOSTED}.`);
	}
	return new URL(HOSTED);
}

const workspace = workspaceAddress();
const offlinePage = path.join(__dirname, "offline.html");
let mainWindow = null;
let retry = null;

const isWorkspace = (address) => {
	try {
		return new URL(address).origin === workspace.origin;
	} catch {
		return false;
	}
};

/** Anywhere outside the workspace opens in the normal browser, and only an https address does. */
function openOutside(address) {
	try {
		const url = new URL(address);
		if (url.protocol === "https:") void shell.openExternal(url.toString());
	} catch {
		// Not an address: nothing is opened.
	}
}

function showWorkspace() {
	clearTimeout(retry);
	retry = null;
	if (mainWindow) void mainWindow.loadURL(workspace.toString());
}

function showOffline() {
	if (!mainWindow) return;
	void mainWindow.loadFile(offlinePage);
	clearTimeout(retry);
	retry = setTimeout(showWorkspace, RETRY_MS);
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 360,
		minHeight: 480,
		title: "Worldwide AI",
		backgroundColor: "#05030A",
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			nodeIntegrationInSubFrames: false,
			webSecurity: true,
			allowRunningInsecureContent: false,
			devTools: false,
			spellcheck: false,
		},
	});
	const contents = mainWindow.webContents;

	// No new windows. A workspace link opens here; anything else opens in the normal browser.
	contents.setWindowOpenHandler(({ url }) => {
		if (isWorkspace(url)) void mainWindow.loadURL(url);
		else openOutside(url);
		return { action: "deny" };
	});
	for (const event of ["will-navigate", "will-redirect"])
		contents.on(event, (details, url) => {
			if (isWorkspace(url)) return;
			details.preventDefault();
			openOutside(url);
		});
	contents.on("will-attach-webview", (event) => event.preventDefault());

	contents.on("did-fail-load", (_event, code, _description, _address, isMainFrame) => {
		// -3 is a load replaced by another one, not a failure.
		if (isMainFrame && code !== -3) showOffline();
	});
	contents.on("render-process-gone", (_event, details) => {
		console.error(`The page stopped (${details.reason}).`);
		showOffline();
	});

	mainWindow.on("closed", () => {
		clearTimeout(retry);
		mainWindow = null;
	});
	showWorkspace();
}

Menu.setApplicationMenu(
	Menu.buildFromTemplate([
		{
			label: "Worldwide AI",
			submenu: [
				{ label: "Reload", accelerator: "CommandOrControl+R", click: showWorkspace },
				{ type: "separator" },
				{ role: "togglefullscreen" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{ role: "editMenu" },
	]),
);

// Every page in every mainWindow runs sandboxed, whatever a page or a setting elsewhere asks for.
app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app.whenReady().then(() => {
		const { session } = require("electron");
		// Nothing the page asks for is granted.
		session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		session.defaultSession.setPermissionCheckHandler(() => false);
		// No file is saved to this computer from the page. A download the workspace offers is a later, reviewed change.
		session.defaultSession.on("will-download", (event) => event.preventDefault());
		createWindow();
	});
	app.on("mainWindow-all-closed", () => app.quit());
}
