# Twitch Chat Overlay (Electron)

A simple, customizable Twitch chat overlay built with Electron, React, and TMI.js. This application runs as a lightweight, always-on-top, borderless window, designed to display live chat from any Twitch channel.
The app supports 7TV channel emotes and allows interaction with the chat by sending messages directly from the overlay using Twitch HELIX api and oauth.

## Features

- **Real-time Twitch Chat:** Connects to any live Twitch channel and displays incoming chat messages.
- **Customizable Window:** Borderless, black background, always-on-top, resizable, and draggable.
- **Performance Optimized:** Implements a message "sliding window" to limit the number of displayed messages, preventing memory growth and ensuring smooth performance in active channels.
- **System Messages:** Provides clear feedback on connection status (connecting, connected, disconnected, errors).
- **Basic Styling:** Displays usernames with their Twitch colors.
- **Auto-Scrolling:** Automatically scrolls to the newest messages, with smart behavior to avoid scrolling if the user is reviewing older messages.
- **Message Sending:** Allows users to send messages directly from the overlay, with support for Twitch's HELIX API and OAuth for authentication.
- **7TV Emotes Support:** Displays 7TV channel emotes in the chat messages.

## Technologies Used

- [Electron](https://www.electronjs.org/): For building cross-platform desktop applications with web technologies.
- [React](https://react.dev/): For building the user interface.
- [Webpack](https://webpack.js.org/): For bundling the application's assets.
- [TMI.js](https://tmijs.com/): A powerful Twitch IRC client library for Node.js, used for connecting to Twitch chat.
- [7TV](https://7tv.app/): Uses 7TV GraphQL api for enhanced emote support in Twitch chat.
- [Twitch HELIX API](https://dev.twitch.tv/docs/api/): For sending messages and managing OAuth authentication.

## Installation

Before you begin, ensure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/get-npm) installed on your system.

1.  **Clone the repository:**

    ```bash
    git clone <your-repo-url> # Replace with your actual repo URL if you have one
    cd twitch-chat-overlay
    ```

    (If you're building locally without a Git repo, simply navigate to your project folder.)

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Usage

To start the application in development mode:

```bash
npm start
```

## How to Use the Overlay

1. **Enter Channel Name:** In the overlay window, type the exact channel name of an ongoing Twitch livestream you wish to monitor.
2. **Connect:** Click the **"Connect to Chat"** button.
3. **View Chat:** If successful, chat messages from that stream will begin to appear in real-time.
4. **Send Messages:** Type your message in the input field at the bottom and press **"Send"** to post it to the Twitch chat.
5. **Disconnect** Click the **"Disconnect"** button to stop receiving messages, and enter a new channel name to switch to a different stream.
6. **Close the App:** Use the **"X"** button in the top-right corner to close the application.

Enjoy your Twitch chat overlay!
