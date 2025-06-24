// twitch-chat-overlay/webpack.config.js

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "development", // Set to 'production' for optimized builds
  entry: "./src/renderer/index.js", // Entry point for your React app
  output: {
    path: path.resolve(__dirname, "dist"), // Output directory
    filename: "renderer.bundle.js", // Name of the bundled JS file
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // Apply Babel to .js and .jsx files
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/, // Process CSS files
        // 'style-loader' injects CSS into the DOM, 'css-loader' interprets @import and url()
        use: ["style-loader", "css-loader"],
      },
      // Add rules for images, fonts etc. if needed later
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"], // Allows importing .js and .jsx files without specifying extensions
  },
  plugins: [
    // Generates an HTML file and injects the bundled JS script.
    // It uses our public/index.html as a template.
    new HtmlWebpackPlugin({
      template: "./public/index.html", // Path to your source HTML template
      filename: "index.html", // Output HTML file name (in 'dist' folder)
      inject: "body", // Inject script tag into the <body>
    }),
    // Copies static assets from 'public' to 'dist'
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "public/style.css", // Source path
          to: "style.css", // Destination path in 'dist/'
        },
        // Add other static assets like images or fonts here if needed
        // { from: 'public/assets/', to: 'assets/' },
      ],
    }),
  ],
  target: "electron-renderer", // Important for Webpack to correctly bundle for Electron's renderer process
  devtool: "source-map", // Generates source maps for easier debugging in DevTools
};
