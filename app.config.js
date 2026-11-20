// Adds secrets from .env.local (git-ignored) on top of app.json.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }],
    './plugins/with-release-signing',
    './plugins/with-cmake-version',
  ],
});
