const tmi = require("tmi.js");

// This client will be shared across connect/disconnect calls
let twitchClient = null;
let currentChannel = null;
let mainWindow = null;

/**
 * Initialize the Twitch chat service with the main window reference.
 * @param {BrowserWindow} window - The main Electron BrowserWindow instance.
 */
function initialize(window) {
  mainWindow = window;
}

/**
 * Sends an IPC message to the renderer process.
 * @param {string} channel The IPC channel name.
 * @param {any} data The data to send.
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Generates a color based on the username.
 * This function uses a simple hash function to map usernames to a set of predefined colors.
 * @param {string} username The Twitch username to generate a color for.
 * @returns {string} A hex color code.
 */
function getColorFromUsername(username) {
  const colors = [
    "#FF4500",
    "#2E8B57",
    "#1E90FF",
    "#DA70D6",
    "#FF1493",
    "#00CED1",
    "#FFD700",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Connects to a Twitch channel.
 * @param {string} channelName The name of the Twitch channel to connect to.
 */
async function connectToChannel(channelName) {
  if (!mainWindow) {
    console.error("TwitchChatService not initialized with mainWindow.");
    return;
  }

  if (twitchClient && twitchClient.readyState() === "OPEN") {
    console.warn("Already connected to a Twitch channel. Disconnecting first.");
    await disconnectFromChannel();
  }

  currentChannel = channelName.toLowerCase();

  // Create a new TMI client instance
  twitchClient = new tmi.Client({
    connection: {
      reconnect: true,
      secure: true,
    },
    channels: [currentChannel],
  });

  // Register event handlers

  // -- Connect to Twitch IRC
  twitchClient.on("connected", (address, port) => {
    console.log(
      `[TwitchChatService] Connected to <span class="math-inline">\{address\}\:</span>{port}, channel: ${currentChannel}`
    );
    sendToRenderer("connection-status", {
      status: "connected",
      channel: currentChannel,
    });
  });

  // -- Handle disconnection
  twitchClient.on("disconnected", (reason) => {
    console.log(`[TwitchChatService] Disconnected: ${reason}`);
    sendToRenderer("connection-status", {
      status: "disconnected",
      reason: reason,
    });
  });

  // -- Handle messages
  twitchClient.on("message", (channel, tags, message, self) => {
    // Ignore messages from ourselves
    if (self) return;

    // Extract relevant data from the message
    const messageData = {
      username: tags["display-name"] || tags.username,
      text: message,
      color: tags["color"] || getColorFromUsername(tags.username),
      // You can add more tags here if needed, like badges, emotes, etc.
      isMod: tags.mod,
      isSub: tags.subscriber,
      isVip: tags.vip,
      isBroadcaster: tags["user-id"] === tags["room-id"],
      messageId: tags.id,
      emotes: tags.emotes, // Raw emotes data
    };

    sendToRenderer("chat-message", messageData);
  });

  // -- Handle cheers
  twitchClient.on("cheer", (channel, tags, message) => {
    const messageData = {
      username: tags["display-name"] || tags.username,
      text: message,
      color: tags["color"] || "#FFD700", // Gold for cheers
      isCheer: true,
      bits: tags.bits,
      messageId: tags.id,
      emotes: tags.emotes, // Raw emotes data
    };

    sendToRenderer("chat-message", messageData);
  });

  // -- Handle timeouts
  twitchClient.on("timeout", (channel, username, reason, duration) => {
    const messageData = {
      username: "System",
      text: `${username} has been timed out for ${duration} seconds. Reason: ${
        reason || "N/A"
      }`,
      color: "#FF6347", // Tomato color for timeout messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // -- Handle bans
  twitchClient.on("ban", (channel, username, reason) => {
    const messageData = {
      username: "System",
      text: `${username} has been banned. Reason: ${reason || "N/A"}`,
      color: "#DC143C", // Crimson color for ban messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // -- Handle raids
  twitchClient.on("raided", (channel, username, viewers) => {
    const messageData = {
      username: "System",
      text: `${username} is raiding with ${viewers} viewers!`,
      color: "#9370DB", // MediumPurple for raid messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // Connect
  try {
    await twitchClient.connect();
  } catch (error) {
    console.error(
      `[TwitchChatService] Failed to connect to ${currentChannel}:`,
      error
    );
    sendToRenderer("connection-status", {
      status: "error",
      channel: currentChannel,
      error: error.message,
    });
    twitchClient = null; // Clear client on error
  }
}

/**
 * Disconnects from the current Twitch channel.
 */
async function disconnectFromChannel() {
  if (twitchClient) {
    try {
      twitchClient.removeAllListeners(); // Clean up all listeners
      await twitchClient.disconnect();
      console.log(`[TwitchChatService] Disconnected from ${currentChannel}`);
      sendToRenderer("connection-status", {
        status: "disconnected",
        channel: currentChannel,
      });
      currentChannel = null;
      twitchClient = null;
    } catch (error) {
      console.error(`[TwitchChatService] Error during disconnect:`, error);
      // Even if disconnect fails, consider it disconnected from the app's perspective
      sendToRenderer("connection-status", {
        status: "disconnected",
        channel: currentChannel,
        error: error.message,
      });
      currentChannel = null;
      twitchClient = null;
    }
  }
}

/**
 * Gets the current connection status.
 * @returns {object} An object indicating the connection status.
 */
function getStatus() {
  if (!twitchClient) {
    return { status: "disconnected", channel: null };
  }
  return {
    status: twitchClient.readyState() === "OPEN" ? "connected" : "connecting",
    channel: currentChannel,
  };
}

// Export the functions for use in other modules
module.exports = {
  initialize,
  connectToChannel,
  disconnectFromChannel,
  getStatus,
};
