import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import Storage from 'expo-sqlite/kv-store';

// Only in the React Native build of firebase/auth (what Metro loads); its public types don't list it.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}

// Web-app config from the Firebase console, kept in .env.local. These values identify the
// project and ship inside every app; the database rules are what protect the data.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = !!config.apiKey && !!config.databaseURL;

// Fast Refresh re-runs this module; reuse the app and auth it already made.
const reused = getApps().length > 0;
const app = reused ? getApp() : initializeApp(config);

// The anonymous ID is saved on the phone (in Yatri's SQLite key-value store),
// so a rider keeps the same ID, and their group, after closing the app.
const auth: Auth = reused
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence({
        getItem: (key) => Storage.getItem(key),
        setItem: (key, value) => Storage.setItem(key, value),
        removeItem: (key) => Storage.removeItem(key),
      }),
    });

export const database = getDatabase(app);

/** This phone's rider ID. Signs in anonymously the first time; no account or email needed. */
export async function ensureSignedIn(): Promise<string> {
  if (!firebaseConfigured) throw new Error('Group rides are not set up in this build.');
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const { user } = await signInAnonymously(auth);
  return user.uid;
}
