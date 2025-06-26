import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import "./ChatPage.css"; // Import styles for the chat page
import "../styles/EmoteStyles.css"; // Styles for 7TV emotes

const MAX_MESSAGES = 300; // Keep only the most recent 500 messages for performance

/**
 * Helper function to add a new message to the list and enforce the MAX_MESSAGES limit
 * by slicing off older messages if the limit is exceeded.
 * @param {Array<Object>} prevMessages The current array of messages.
 * @param {Object} newMessage The new message object to add.
 * @returns {Array<Object>} The updated and potentially sliced array of messages.
 */
const addMessageAndSlice = (prevMessages, newMessage) => {
  const newMessages = [...prevMessages, newMessage];
  if (newMessages.length > MAX_MESSAGES) {
    // Slice from the (length - MAX_MESSAGES) index to keep only the latest messages
    return newMessages.slice(newMessages.length - MAX_MESSAGES);
  }
  return newMessages;
};

/**
 * Main application component for the Twitch Chat Overlay.
 * Manages UI state, user input for channel connection,
 * displays chat messages, and interacts with the main Electron process via IPC.
 */
function ChatPage({ authenticatedUsername }) {
  // State to store the channel name entered by the user
  const [channelName, setChannelName] = useState("");

  // State to store the list of chat messages to be displayed
  // Initializes with a system message
  const [messages, setMessages] = useState([
    {
      username: "System",
      text: authenticatedUsername
        ? `Logged in as ${authenticatedUsername}. Enter a channel name to connect!`
        : "Enter a channel name to connect!",
      color: "#AAAAAA", // Grey color for system messages
    },
  ]);

  // State to track the actual connection status to Twitch chat
  const [isConnected, setIsConnected] = useState(false);

  // State to manage the "connecting" loading state, preventing multiple connection attempts
  const [isConnecting, setIsConnecting] = useState(false);

  // useRef hook to get a direct reference to the chat display area DOM element
  // This is used for scrolling the chat messages
  const chatContainerRef = useRef(null);

  // Track if the user was at the bottom before new messages
  const wasAtBottomRef = useRef(true);

  // States to store the cached 7TV emotes
  const [global7TvEmotes, setGlobal7TvEmotes] = useState(new Map()); // Map<name, url>
  const [channel7TvEmotes, setChannel7TvEmotes] = useState(new Map()); // Map<name, url>

  /**
   * Callback to fetch and set the initial 7TV global and channel emotes.
   * This function is called once when the component mounts to ensure we have the latest emotes
   */
  const fetchAndSetInitial7TvEmotes = useCallback(async () => {
    try {
      if (!window.electronAPI) {
        console.error("electronAPI is not available. Cannot fetch 7TV emotes.");
        return;
      }
      console.log("[Renderer] Attempting to fetch initial 7TV emotes...");
      const globalEmotes = await window.electronAPI.get7TvGlobalEmotes();
      const channelEmotes = await window.electronAPI.get7TvChannelEmotes();

      setGlobal7TvEmotes(new Map(globalEmotes));
      setChannel7TvEmotes(new Map(channelEmotes));
      console.log(
        `[Renderer] Fetched ${globalEmotes.length} global and ${channelEmotes.length} channel 7TV emotes.`
      );
    } catch (error) {
      console.error("[Renderer] Error fetching initial 7TV emotes:", error);
    }
  }, [setGlobal7TvEmotes, setChannel7TvEmotes]); // Dependencies: state setters (React guarantees these are stable reference)

  /**
   * useEffect hook for setting up IPC listeners from the main process.
   * This effect runs once on component mount and sets up listeners for:
   * - Incoming chat messages (`onChatMessage`)
   * - Connection status updates (`onConnectionStatus`)
   */
  useEffect(() => {
    if (window.electronAPI) {
      // Register a listener for 'chat-message' events sent from the main process
      // The callback receives the message data (username, text, color, etc.)
      window.electronAPI.onChatMessage((_event, message) => {
        console.log(`[Renderer] Received chat message:`, message);

        setMessages((prevMessages) =>
          addMessageAndSlice(prevMessages, message)
        );
      });

      // Register a listener for connection-status events sent from the main process
      window.electronAPI.onConnectionStatus((_event, statusData) => {
        console.log(`[Renderer] Connection status:`, statusData);

        if (statusData.status === "connected") {
          // -- CONNECTED
          setIsConnected(true);
          setIsConnecting(false);

          setMessages((prevMessages) => {
            const newStatusMessage = {
              username: "System",
              text: `Successfully connected to #${statusData.channel}!`,
              color: "#32CD32", // Lime Green
            };
            // If only the initial "Enter channel" message is present, replace it with new status.
            // Otherwise, just append the connection success message via helper.
            if (
              prevMessages.length === 1 &&
              prevMessages[0].text === "Enter a channel name to connect!"
            ) {
              return [newStatusMessage]; // Replace initial message
            }
            return addMessageAndSlice(prevMessages, newStatusMessage);
          });
        } else if (statusData.status === "disconnected") {
          // -- DISCONNECTED
          setIsConnected(false);
          setIsConnecting(false);
          setMessages((prevMessages) =>
            addMessageAndSlice(prevMessages, {
              username: "System",
              text: `Disconnected from #${statusData.channel}. ${
                statusData.reason ? `(Reason: ${statusData.reason})` : ""
              }`,
              color: "#FF4500", // Orange Red
            })
          );
          setChannelName("");
        } else if (statusData.status === "error") {
          // -- ERROR
          setIsConnected(false);
          setIsConnecting(false);
          setMessages((prevMessages) =>
            addMessageAndSlice(prevMessages, {
              username: "System",
              text: `Connection error for #${statusData.channel}: ${
                statusData.error || "Unknown error"
              }`,
              color: "#DC143C", // Crimson
            })
          );
        }
      });

      // Register a listener for 7TV global emotes updates
      window.electronAPI.on7TvEmotesUpdate((_event, emotesData) => {
        console.log("[Renderer] Received 7TV Emotes Update:", emotesData);
        // Convert array of [name, url] back to Map for efficient lookup
        setGlobal7TvEmotes(new Map(emotesData.globalEmotes));
        setChannel7TvEmotes(new Map(emotesData.channelEmotes));
      });

      //Initial fetch for 7TV Emotes on component mount
      fetchAndSetInitial7TvEmotes();
    } else {
      console.error(
        "electronAPI is not available! Cannot listen for chat messages or connection status."
      );
    }

    return () => {
      // Cleanup
    };
  }, [fetchAndSetInitial7TvEmotes]);

  /**
   * useLayoutEffect hook for auto-scrolling the chat display area.
   * This effect runs whenever the 'messages' state changes (i.e., a new message arrives).
   */
  useLayoutEffect(() => {
    if (chatContainerRef.current) {
      const { scrollHeight } = chatContainerRef.current; // We only need scrollHeight here

      // Rule: If the user was at the bottom (as recorded by wasAtBottomRef),
      // OR if it's the very first message(s) (messages.length <= 1), then auto-scroll.
      if (wasAtBottomRef.current || messages.length <= 1) {
        console.log("Auto-scrolling: Condition met. Scrolling to bottom.");
        chatContainerRef.current.scrollTop = scrollHeight;
      } else {
        console.log(
          "Auto-scrolling: Condition NOT met (not at bottom before update)."
        );
      }
    }
  }, [messages]);

  /**
   * useEffect hook to handle scroll events in the chat container.
   * This effect sets up an event listener to detect when the user scrolls the chat display area.
   * It updates the `wasAtBottomRef` to track whether the user is currently at or near the bottom of the chat display area.
   * This is crucial for determining whether to auto-scroll when new messages arrive.
   */
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    const handleScroll = () => {
      const { scrollHeight, clientHeight, scrollTop } = chatContainer;

      // Define a tolerance for "near the bottom" to avoid flickering
      // This allows for a small margin of error when determining if the user is at the bottom
      const SCROLL_TOLERANCE = 20;

      // Check if the user is currently at or very near the absolute bottom
      const isCurrentlyAtOrNearBottom =
        scrollHeight - (scrollTop + clientHeight) < SCROLL_TOLERANCE;

      // Only update the ref if its state actually changes, to avoid unnecessary re-renders/logs
      if (wasAtBottomRef.current !== isCurrentlyAtOrNearBottom) {
        wasAtBottomRef.current = isCurrentlyAtOrNearBottom;
        console.log(
          "User scroll detected! wasAtBottomRef updated to:",
          wasAtBottomRef.current
        );
      }
    };

    // Add the scroll event listener
    chatContainer.addEventListener("scroll", handleScroll);

    // Cleanup the event listener when the component unmounts
    return () => {
      chatContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  /**
   * Formats a message text by replacing recognized 7TV emotes with corresponding image tags.
   * It checks both channel-specific and global 7TV emotes, prioritizing channel emotes.
   * If a word matches an emote, it replaces it with an <img> tag with the emote's URL.
   * If no emote matches, it returns the word as plain text.
   * @param {string} text
   * @returns
   */
  const formatMessageWithEmotes = (text) => {
    if (!text) return null;

    const words = text.split(/\s+/); // Split by whitespace to get individual words
    const processedContent = [];

    words.forEach((word, index) => {
      let emoteUrl = null;

      // Prioritize channel emotes over global emotes
      if (channel7TvEmotes.has(word)) {
        emoteUrl = channel7TvEmotes.get(word);
      } else if (global7TvEmotes.has(word)) {
        emoteUrl = global7TvEmotes.get(word);
      }

      if (emoteUrl) {
        // If it's an emote, add an img tag
        // Ensure 'https:' prefix if the URL might be protocol-relative (starts with //)
        const fullEmoteUrl = emoteUrl.startsWith("//")
          ? `https:${emoteUrl}`
          : emoteUrl;
        processedContent.push(
          <img
            key={`${word}-${index}`}
            src={fullEmoteUrl}
            alt={word}
            className="chat-emote 7tv-emote" // Add classes for styling
            title={word} // Show emote name on hover
          />
        );
      } else {
        // If it's not an emote, add the word as text
        processedContent.push(word);
      }

      // Add a space after each word except the last one
      if (index < words.length - 1) {
        processedContent.push(" ");
      }
    });

    return <>{processedContent}</>; // Return a React Fragment
  };

  /**
   * Handles the click event for the "Connect" / "Disconnect" button.
   * Manages the connection/disconnection logic and UI state transitions.
   */
  const handleConnectToggle = () => {
    if (isConnecting) return;

    const trimmedChannelName = channelName.trim();

    // --- DISCONNECT LOGIC ---
    if (isConnected) {
      console.log(
        `[Renderer] Disconnecting from channel: ${trimmedChannelName}`
      );
      if (window.electronAPI && window.electronAPI.disconnectFromTwitch) {
        window.electronAPI.disconnectFromTwitch();
      } else {
        console.error("electronAPI.disconnectFromTwitch is not available.");
        // Fallback if API not ready
        setIsConnected(false);
        setMessages((prevMessages) =>
          addMessageAndSlice(prevMessages, {
            username: "System",
            text: `Failed to request disconnect from #${trimmedChannelName}.`,
            color: "#FF4500",
          })
        );
      }
      // --- CONNECT LOGIC ---
    } else {
      if (trimmedChannelName) {
        setIsConnecting(true);
        // Clear previous messages before connecting to a new channel
        setMessages([
          {
            username: "System",
            text: `Attempting to connect to: #${trimmedChannelName}...`,
            color: "#ADD8E6",
          },
        ]);
        if (window.electronAPI && window.electronAPI.connectToTwitch) {
          // Send an IPC message to the main process to initiate Twitch connection
          window.electronAPI.connectToTwitch(trimmedChannelName);
        } else {
          console.error(
            "electronAPI.connectToTwitch is not available. Cannot connect to Twitch."
          );
          setIsConnecting(false); // Reset connecting state if API not ready
          setMessages((prevMessages) =>
            addMessageAndSlice(prevMessages, {
              username: "System",
              text: `Connection failed: Electron API not available.`,
              color: "#DC143C",
            })
          );
        }
      } else {
        // Alert if channel name is empty
        alert("Please enter a channel name.");
      }
    }
  };

  /**
   * Handles the 'keydown' event on the channel input field.
   * Triggers the connect/disconnect toggle when the 'Enter' key is pressed.
   * @param {KeyboardEvent} event The keyboard event object.
   */
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleConnectToggle();
    }
  };

  return (
    <>
      <div className="chat-display-area" ref={chatContainerRef}>
        {messages.map((msg, index) => (
          <p key={index} className="chat-message">
            <span
              className="username"
              style={{ color: msg.color || "#FFFFFF" }}
            >
              {msg.username}:
            </span>{" "}
            {msg.isSystem ? msg.text : formatMessageWithEmotes(msg.text)}
          </p>
        ))}
      </div>
      <div className="controls">
        {authenticatedUsername && isConnected && (
          <div className="authenticated-user-status">
            Connected as:{" "}
            <span style={{ color: "var(--twitch-purple)" }}>
              {authenticatedUsername}
            </span>
          </div>
        )}
        {!isConnected ? (
          <>
            <input
              type="text"
              id="channelInput"
              placeholder="Enter Twitch channel name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
            />
            <button
              id="connectButton"
              onClick={handleConnectToggle}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect to Chat"}
            </button>
          </>
        ) : (
          <button id="disconnectButton" onClick={handleConnectToggle}>
            Disconnect from #{channelName.trim()}
          </button>
        )}
      </div>
    </>
  );
}

export default ChatPage;
