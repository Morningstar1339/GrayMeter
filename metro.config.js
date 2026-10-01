const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Resolve expo-sqlite to web shim when building for web
// expo-sqlite uses WASM/native SQLite which doesn't work in browsers
config.resolver = config.resolver || {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    return {
      filePath: path.resolve(__dirname, 'expo-sqlite-web.js'),
      type: 'sourceFile',
    };
  }
  // Fall through to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
