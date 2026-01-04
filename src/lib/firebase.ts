import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if we have at least an API key, to prevent build-time crashes
let app;
if (getApps().length > 0) {
    app = getApp();
} else if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
} else {
    // During build, environment variables might be missing. 
    // We create a dummy app or handle it gracefully.
    console.warn("Firebase config is incomplete. Firebase will not be initialized.");
    app = {} as any;
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Messaging is only supported in the browser
export const messaging = async () => {
    const supported = await isSupported();
    return supported ? getMessaging(app) : null;
};

export default app;
