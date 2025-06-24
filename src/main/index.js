// twitch-chat-overlay/src/main/index.js

try {
  require("electron-reloader")(module);
} catch (_) {}
const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");
const twitchChatService = require("./services/twitchChatService");

let mainWindow;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const windowWidth = 350;
  const windowHeight = 200; // Initial smaller height for just input
  const windowX = width - windowWidth - 20;
  const windowY = 20;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowX,
    y: windowY,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: windowWidth,
    minHeight: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../../src/preload/index.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  mainWindow.webContents.openDevTools({ mode: "detach" });

  // Intialize Twitch chat service with the main window reference
  twitchChatService.initialize(mainWindow);

  // --- IPC Main Process Listener for Twitch Connection ---
  ipcMain.on("connect-to-twitch", async (event, channelName) => {
    console.log(
      `[Main Process] Received request to connect to Twitch channel: ${channelName}`
    );
    await twitchChatService.connectToChannel(channelName);
  });

  // --- IPC Main Process Listener for Twitch Disconnection ---
  ipcMain.on("disconnect-from-twitch", async () => {
    console.log("[Main Process] Received request to disconnect from Twitch.");
    await twitchChatService.disconnectFromChannel();
  });

  // --- IPC Main Process Listener for Close App Button ---
  ipcMain.on("close-app", () => {
    if (mainWindow) {
      mainWindow.close(); // Close the window
    }
  });

  // --- Window Event Handlers ---
  mainWindow.on("closed", () => {
    twitchChatService.disconnectFromChannel(); // Ensure we disconnect when the window is closed
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
