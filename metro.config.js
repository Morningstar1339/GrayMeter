// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add WASM support for expo-sqlite on web
config.resolver.assetExts.push('wasm');

// Ensure WASM files are treated as assets
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;