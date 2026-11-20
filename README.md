# Yatri

A motorbike riding app for Android and iOS, built with Expo (SDK 58) and React Native.

## Features

- **Ride recording**: live speed, distance, average and top speed, lean angle and G-force, with overspeed alerts (sound, vibration and voice). Keeps recording with the phone locked on Android.
- **Navigation**: place search, turn-by-turn directions with voice, and nearby fuel, hospitals, food, parking and toilets.
- **Group rides**: share a 6-digit code, see everyone live on the map with speed and distance, a leader and a shared destination, nicknames, rider avatars, and one-tap quick messages ("Traffic jam ahead", "Regroup here"…).
- **Garage**: vehicles, odometer, fuel log and service reminders.
- **History**: every ride with its route, speed chart and stats.
- **Parking**: remembers where you left the bike.
- **Your look**: light and dark themes and a custom accent colour.

## Run it

```bash
npm install
npx expo start
```

Then open the project in Expo Go, or in a development build for features Expo Go doesn't support (location with the phone locked).

### Secrets

Keys are read from a git-ignored `.env.local` in the project root:

```
GOOGLE_MAPS_API_KEY=...
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_DATABASE_URL=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

Group rides need a Firebase project with Anonymous sign-in and a Realtime Database, using the rules in [`firebase/database.rules.json`](firebase/database.rules.json).

## Build an Android APK

The `android/` folder is generated, so don't edit it by hand. Release builds are signed with a keystore whose path and passwords come from `YATRI_UPLOAD_*` in `~/.gradle/gradle.properties` (see [`plugins/with-release-signing.js`](plugins/with-release-signing.js)).

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## Project layout

- `src/app`: screens (Expo Router, file-based routes)
- `src/components`: UI pieces
- `src/lib`: ride tracking, navigation, group rides, avatars
- `src/db`: on-device SQLite storage
- `scripts`: generators for the logo, wordmark, avatars and alert sound
- `plugins`: Expo config plugins (signing, CMake version)
