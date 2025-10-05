const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Function to request connection to a Twitch channel from main process
  connectToTwitch: (channelName) => {
    console.log(`[Preload] Sending IPC: connect-to-twitch for ${channelName}`);
    ipcRenderer.send("connect-to-twitch", channelName);
  },
  // Function to request disconnection from the main process
  disconnectFromTwitch: () => {
    console.log("[Preload] Sending IPC: disconnect-from-twitch");
    ipcRenderer.send("disconnect-from-twitch");
  },
  // Function for the renderer to listen for incoming chat messages
  onChatMessage: (callback) => {
    ipcRenderer.on("chat-message", callback);
    return () => ipcRenderer.removeListener("chat-message", callback);
  },
  // Function for the renderer to listen for connection status updates
  onConnectionStatus: (callback) => {
    ipcRenderer.on("connection-status", callback);
    return () => ipcRenderer.removeListener("connection-status", callback);
  },
  // Function to start the Twitch OAuth authentication flow
  startOAuthFlow: () => {
    console.log("[Preload] Sending IPC: start-oauth-flow");
    ipcRenderer.send("start-oauth-flow");
  },
  // Function for the renderer to listen for OAuth status messages
  onOAuthStatus: (callback) => {
    ipcRenderer.on("oauth-status", callback);
    return () => ipcRenderer.removeListener("oauth-status", callback);
  },
  // Functions to get 7TV global and channel emotes
  get7TvGlobalEmotes: () => ipcRenderer.invoke("get-7tv-global-emotes"),
  get7TvChannelEmotes: () => ipcRenderer.invoke("get-7tv-channel-emotes"),
  // Function to listen for 7TV emotes updates
  on7TvEmotesUpdate: (callback) => {
    ipcRenderer.on("7tv-emotes-update", callback);
    return () => ipcRenderer.removeListener("7tv-emotes-update", callback);
  },
  // Function to send a message to the main process
  sendMessage: (message) => {
    console.log(`[Preload] Sending IPC: send-message: ${message}`);
    ipcRenderer.send("send-message", message);
  },
  // Function to close the application
  closeApp: () => {
    ipcRenderer.send("close-app");
  },
});
