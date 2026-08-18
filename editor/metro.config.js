// O runtime do Mermaid é um asset .html embutido no canvas (ESPECIFICACAO-APP-RN-EXPO.md §3, §8.1).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');

module.exports = config;
