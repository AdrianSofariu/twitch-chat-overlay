try {
  require("electron-reloader")(module);
  require("dotenv").config();
} catch (_) {}

const { app, BrowserWindow, screen, ipcMain, shell } = require("electron");
const path = require("path");
const twitchChatService = require("./services/twitchChatService");
const sevenTvService = require("./services/sevenTvService");
const oauthServer = require("./services/oauthServer");
const config = require("../config");

// Main window reference
let mainWindow;

/**
 * Creates the main application window.
 * Sets up the window properties, loads the HTML file, and initializes services.
 */
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const windowWidth = 350;
  const windowHeight = 400; // Initial smaller height for just input
  const windowX = width - windowWidth - 40;
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

  // Initialize 7TV service with the main window reference
  sevenTvService.initialize(mainWindow);

  // Initialize OAuth server with the main window reference
  oauthServer.initializeOAuthServer(
    mainWindow,
    {
      clientId: config.TWITCH_CLIENT_ID,
      clientSecret: config.TWITCH_CLIENT_SECRET,
      redirectPort: config.OAUTH_REDIRECT_PORT,
      redirectUri: config.OAUTH_REDIRECT_URI,
    },
    // Callback for successful OAuth
    (authData) => {
      console.log(`[Main Process] OAuth successful for ${authData.username}!`);

      // Notify the renderer process of successful authentication
      mainWindow.webContents.send("oauth-status", {
        success: true,
        username: authData.username,
        message: "Authentication successful!",
      });

      // Start automatic token refresh
      oauthServer.startTokenAutoRefresh();

      // After successful OAuth, load the main chat page
      const chatWindowWidth = 400;
      const chatWindowHeight = 600;
      mainWindow.setSize(chatWindowWidth, chatWindowHeight);
      mainWindow.setMinimumSize(250, 150);

      console.log("[Main Process] Loaded chat after OAuth.");
    },
    // Callback for OAuth failure
    (errorMessage) => {
      console.error(`[Main Process] OAuth failed: ${errorMessage}`);
      oauthServer.clearAuthDetails(); // Clear auth details on failure
      oauthServer.stopTokenAutoRefresh();
      mainWindow.webContents.send("oauth-status", {
        success: false,
        error: errorMessage,
      });
    }
  );

  // --- IPC Main Process Listener for Twitch Connection ---
  ipcMain.on("connect-to-twitch", async (event, channelName) => {
    console.log(
      `[Main Process] Received request to connect to Twitch channel: ${channelName}`
    );
    const authDetails = oauthServer.getAuthDetails();

    if (authDetails && authDetails.token && authDetails.username) {
      // Fetch user ID for the channel and load 7TV channel emotes
      const twitchUserId = await sevenTvService.getTwitchUserId(
        channelName,
        authDetails.token
      );
      if (twitchUserId) {
        await sevenTvService.fetchChannelEmotes(twitchUserId);
      } else {
        console.warn(
          `[Main Process] Could not get Twitch User ID for ${channelName}. 7TV channel emotes may not load.`
        );
      }
      // Connect to the Twitch channel with the provided auth details
      await twitchChatService.connectToChannel(channelName, authDetails);
    } else {
      console.warn(
        "[Main Process] Attempted to connect to Twitch chat without authentication."
      );
      mainWindow.webContents.send("connection-status", {
        status: "error",
        channel: channelName,
        error: "Authentication required to connect to chat.",
      });
      mainWindow.webContents.send("chat-message", {
        username: "System",
        text: "Connection failed: Please authenticate with Twitch first.",
        color: "#FF0000",
        isSystem: true,
      });
    }
  });

  // --- IPC Main Process Listener for Twitch Disconnection ---
  ipcMain.on("disconnect-from-twitch", async () => {
    console.log("[Main Process] Received request to disconnect from Twitch.");
    await twitchChatService.disconnectFromChannel();
  });

  // --- IPC Main Process Listener for Sending Messages ---
  ipcMain.on("send-message", (event, message) => {
    console.log(`[Main Process] Received message to send: ${message}`);
    try {
      const success = twitchChatService.sendMessage(message);
      if (!success) {
        mainWindow.webContents.send("chat-message", {
          username: "System",
          text: "Failed to send message. Please check your connection.",
          color: "#FF0000",
          isSystem: true,
        });
      }
    } catch (error) {
      console.error(`[Main Process] Error sending message: ${error.message}`);
      mainWindow.webContents.send("chat-message", {
        username: "System",
        text: `Error sending message: ${error.message || "Unknown error"}`,
        color: "#DC143C",
        isSystem: true,
      });
    }
  });

  // --- IPC Main Process Listener for Close App Button ---
  ipcMain.on("close-app", () => {
    if (mainWindow) {
      mainWindow.close(); // Close the window
    }
  });

  // --- IPC Main Process Listener for Twitch OAuth URL ---
  ipcMain.on("start-oauth-flow", (event) => {
    if (!config.TWITCH_CLIENT_ID) {
      console.error("TWITCH_CLIENT_ID is not set in .env file.");
      event.reply("oauth-status", {
        success: false,
        error: "Client ID missing.",
      });
      return;
    }

    const scopes = [
      "chat:read",
      "chat:edit",
      "channel:moderate",
      "user:read:email",
    ].join(" ");

    const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${
      config.TWITCH_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
      config.OAUTH_REDIRECT_URI
    )}&scope=${encodeURIComponent(scopes)}`;

    shell.openExternal(twitchAuthUrl);
    console.log(`[Main] Opened Twitch Auth URL: ${twitchAuthUrl}`);

    event.reply("oauth-flow-initiated", {
      message:
        "OAuth flow started. Please complete the authorization in your browser.",
    });

    //Start the OAuth redirect server
    oauthServer.startOAuthServer();
  });

  // --- Window Event Handlers ---
  mainWindow.on("closed", () => {
    twitchChatService.disconnectFromChannel(); // Ensure we disconnect when the window is closed
    oauthServer.stopTokenAutoRefresh(); // Stop token refresh on close
    oauthServer.stopOAuthServer();
    mainWindow = null;
  });
}

// --- Electron App Lifecycle Events ---
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

app.on("quit", () => {
  oauthServer.stopTokenAutoRefresh(); // Stop token refresh on app quit
  oauthServer.stopOAuthServer();
});
