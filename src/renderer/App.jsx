// twitch-chat-overlay/src/renderer/App.jsx

import React, { useState, useEffect, useRef } from "react";

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
function App() {
  // State to store the channel name entered by the user
  const [channelName, setChannelName] = useState("");

  // State to store the list of chat messages to be displayed
  // Initializes with a system message
  const [messages, setMessages] = useState([
    {
      username: "System",
      text: "Enter a channel name to connect!",
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
                statusData.reason ? `Reason: ${statusData.reason}` : ""
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
    } else {
      console.error(
        "electronAPI is not available! Cannot listen for chat messages or connection status."
      );
    }

    return () => {
      // Cleanup
    };
  }, []);

  /**
   * useEffect hook for auto-scrolling the chat display area.
   * This effect runs whenever the 'messages' state changes (i.e., a new message arrives).
   */
  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight, scrollTop } =
        chatContainerRef.current;
      // Determine if the user is near the bottom of the chat
      // 'clientHeight + 50' gives a 50px buffer for being "near" the bottom
      const isNearBottom = scrollHeight - scrollTop <= clientHeight + 50;

      // If the user is near the bottom, or if it's the very first few messages,
      // automatically scroll to the newest message (bottom)
      if (isNearBottom || messages.length <= 1) {
        chatContainerRef.current.scrollTop = scrollHeight;
      }
    }
  }, [messages]); // Dependency array: Effect re-runs whenever the 'messages' array updates.

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

  const handleCloseApp = () => {
    if (window.electronAPI && window.electronAPI.closeApp) {
      window.electronAPI.closeApp();
    } else {
      console.error("electronAPI.closeApp is not available.");
    }
  };

  return (
    <>
      {/* Draggable header with close button */}
      <div className="draggable-header">
        <button className="close-button" onClick={handleCloseApp}>
          X
        </button>{" "}
        {/* <-- ADDED: Close button */}
      </div>

      <div className="chat-display-area" ref={chatContainerRef}>
        {messages.map((msg, index) => (
          <p key={index} className="chat-message">
            <span
              className="username"
              style={{ color: msg.color || "#FFFFFF" }}
            >
              {msg.username}:
            </span>{" "}
            {msg.text}
          </p>
        ))}
      </div>
      <div className="controls">
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

export default App;
