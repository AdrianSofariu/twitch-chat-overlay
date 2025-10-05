const fetch = require("node-fetch");
const config = require("../../config");
const { ipcMain } = require("electron");

// Emote cache
let globalSevenTvEmotes = new Map();
let channelSevenTvEmotes = new Map();

// Reference to the main window
let mainWindow = null;

// Base URL from 7TV GraphQL API
const SEVENTV_API_BASE_URL = "https://7tv.io/v3";

/**
 * Initializes the 7TV service.
 * @param {BrowserWindow} mainWindow
 */
function initialize(mainWindow) {
  mainWindowRef = mainWindow;
  console.log("[7TV Service] Initializing and fetching global emotes...");
  fetchGlobalEmotes();
  setupIpcHandlers();
}

/**
 * Fetches global 7TV emotes and caches them.
 */
async function fetchGlobalEmotes() {
  try {
    const response = await fetch(`${SEVENTV_API_BASE_URL}/emote-sets/global`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch global 7TV emotes: ${response.statusText}`
      );
    }
    const data = await response.json();
    globalSevenTvEmotes.clear();
    if (data.emotes && Array.isArray(data.emotes)) {
      data.emotes.forEach((emote) => {
        // Ensure emote and its data.host.url exist before constructing
        if (
          emote.name &&
          emote.data &&
          emote.data.host &&
          emote.data.host.url
        ) {
          const emoteUrl = `${emote.data.host.url}/2x.webp`;
          globalSevenTvEmotes.set(emote.name, emoteUrl);
        }
      });
    }
    console.log(
      `[7TV Service] Fetched ${globalSevenTvEmotes.size} global 7TV emotes.`
    );
    sendEmotesToRenderer();
  } catch (error) {
    console.error("[7TV Service] Error fetching global 7TV emotes:", error);
  }
}

/**
 * Fetches Twitch User ID from a username using Twitch Helix API.
 * This is necessary because 7TV channel emotes API uses Twitch User IDs, not usernames.
 * @param {string} username - The Twitch username.
 * @returns {Promise<string|null>} The Twitch User ID or null if not found/error.
 */
async function getTwitchUserId(username, token) {
  if (!config.TWITCH_CLIENT_ID) {
    console.error(
      "[7TV Service] TWITCH_CLIENT_ID is not configured. Cannot fetch Twitch User ID."
    );
    return null;
  }
  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${username}`,
      {
        headers: {
          "Client-ID": config.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch Twitch User ID for ${username}: ${response.status} - ${errorText}`
      );
    }
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return data.data[0].id;
    }
    return null;
  } catch (error) {
    console.error(
      `[7TV Service] Error fetching Twitch User ID for ${username}:`,
      error
    );
    return null;
  }
}

/**
 * Fetches channel-specific 7TV emotes for a given Twitch User ID and caches them.
 * @param {string} twitchUserId - The Twitch User ID of the channel.
 */
async function fetchChannelEmotes(twitchUserId) {
  if (!twitchUserId) {
    console.warn(
      "[7TV Service] No Twitch User ID provided to fetch channel emotes."
    );
    return;
  }
  try {
    const response = await fetch(
      `${SEVENTV_API_BASE_URL}/users/twitch/${twitchUserId}`
    );
    if (!response.ok) {
      if (response.status === 404) {
        console.log(
          `[7TV Service] No 7TV emotes (or user not found) for channel ID: ${twitchUserId}`
        );
        channelSevenTvEmotes.delete(twitchUserId);
        sendEmotesToRenderer();
        return;
      }
      throw new Error(
        `Failed to fetch 7TV channel emotes for ${twitchUserId}: ${response.statusText}`
      );
    }
    const data = await response.json();

    const emotesForChannel = new Map();
    // Assuming the channel emotes are under data.emote_set.emotes based on common 7TV user structure
    if (data.emote_set && Array.isArray(data.emote_set.emotes)) {
      data.emote_set.emotes.forEach((emote) => {
        if (
          emote.name &&
          emote.data &&
          emote.data.host &&
          emote.data.host.url
        ) {
          const emoteUrl = `${emote.data.host.url}/2x.webp`;
          emotesForChannel.set(emote.name, emoteUrl);
        }
      });
    }
    channelSevenTvEmotes.set(twitchUserId, emotesForChannel);
    console.log(
      `[7TV Service] Fetched ${emotesForChannel.size} 7TV emotes for channel ID: ${twitchUserId}`
    );
    sendEmotesToRenderer();
  } catch (error) {
    console.error(
      `[7TV Service] Error fetching 7TV channel emotes for ${twitchUserId}:`,
      error
    );
    channelSevenTvEmotes.delete(twitchUserId);
    sendEmotesToRenderer();
  }
}

/**
 * Sends the current global and channel emotes to the renderer process.
 * This is crucial for the renderer to display them.
 */
function sendEmotesToRenderer() {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    const currentChannelIds = Array.from(channelSevenTvEmotes.keys());
    const lastFetchedChannelId =
      currentChannelIds.length > 0
        ? currentChannelIds[currentChannelIds.length - 1]
        : null;

    const currentChannelEmotesArray = lastFetchedChannelId
      ? Array.from(
          channelSevenTvEmotes.get(lastFetchedChannelId)?.entries() || []
        )
      : [];

    mainWindowRef.webContents.send("7tv-emotes-update", {
      globalEmotes: Array.from(globalSevenTvEmotes.entries()),
      channelEmotes: currentChannelEmotesArray,
    });
    console.log("[7TV Service] Sent emote update to renderer.");
  }
}

/**
 * Sets up IPC handlers for renderer process to request emotes.
 */
function setupIpcHandlers() {
  ipcMain.handle("get-7tv-global-emotes", () => {
    return Array.from(globalSevenTvEmotes.entries());
  });

  ipcMain.handle("get-7tv-channel-emotes", () => {
    const currentChannelIds = Array.from(channelSevenTvEmotes.keys());
    const lastFetchedChannelId =
      currentChannelIds.length > 0
        ? currentChannelIds[currentChannelIds.length - 1]
        : null;

    return lastFetchedChannelId
      ? Array.from(
          channelSevenTvEmotes.get(lastFetchedChannelId)?.entries() || []
        )
      : [];
  });
}

module.exports = {
  initialize,
  fetchGlobalEmotes,
  fetchChannelEmotes,
  getTwitchUserId,
};
