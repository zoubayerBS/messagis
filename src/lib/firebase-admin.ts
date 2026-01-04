import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

        if (serviceAccountKey) {
            // Handle cases where the key might be wrapped in quotes
            if (serviceAccountKey.startsWith("'") && serviceAccountKey.endsWith("'")) {
                serviceAccountKey = serviceAccountKey.slice(1, -1);
            }
            if (serviceAccountKey.startsWith('"') && serviceAccountKey.endsWith('"')) {
                serviceAccountKey = serviceAccountKey.slice(1, -1);
            }

            // Replace literal newlines with escaped ones for JSON.parse
            const cleanedKey = serviceAccountKey.replace(/\n/g, "\\n");
            const serviceAccount = JSON.parse(cleanedKey);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log("Firebase Admin initialized");
        } else {
            console.warn("FIREBASE_SERVICE_ACCOUNT_KEY not found. Push notifications will be disabled.");
        }
    } catch (error) {
        console.error("Firebase Admin initialization error:", error);
    }
}

export const adminDb = admin.apps.length ? admin.firestore() : null;
export const adminMessaging = admin.apps.length ? admin.messaging() : null;
export default admin;
