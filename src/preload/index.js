// twitch-chat-overlay/src/preload/index.js

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
    ipcRenderer.removeAllListeners("chat-message");
    // Add the new listener
    ipcRenderer.on("chat-message", callback);
  },
  // Function for the renderer to listen for connection status updates
  onConnectionStatus: (callback) => {
    ipcRenderer.removeAllListeners("connection-status");
    // Add the new listener
    ipcRenderer.on("connection-status", callback);
  },
  closeApp: () => {
    ipcRenderer.send("close-app");
  },
});
