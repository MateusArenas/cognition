// O plugin do Reanimated sempre por último (ESPECIFICACAO-APP-RN-EXPO.md §3).
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
