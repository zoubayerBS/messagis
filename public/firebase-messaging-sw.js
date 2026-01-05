importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAwPHnhveIo5pBhLs3bh3tR8-NxQOOvlfg",
    authDomain: "messagis-app.firebaseapp.com",
    projectId: "messagis-app",
    storageBucket: "messagis-app.firebasestorage.app",
    messagingSenderId: "734554633811",
    appId: "1:734554633811:web:e7e82af91729e4f3d738a6"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Check if window is focused
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client && client.visibilityState === 'visible') {
                console.log('[firebase-messaging-sw.js] App is focused, suppressing notification.');
                return; // Do nothing, let the in-app toast handle it
            }
        }

        // If not focused, show notification from data payload
        const notificationTitle = payload.data?.title || payload.notification?.title || "Nouveau message";
        const notificationBody = payload.data?.body || payload.notification?.body || "Vous avez reçu un nouveau message.";

        const notificationOptions = {
            body: notificationBody,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            data: payload.data, // Keep the data available for click handling
            vibrate: [200, 100, 200],
            tag: payload.data?.tag || 'messagis-notification',
            renotify: true,
            requireInteraction: true,
            actions: [
                {
                    action: 'reply',
                    title: 'Répondre ✍️',
                    icon: '/icons/reply-icon.png'
                },
                {
                    action: 'open',
                    title: 'Ouvrir Messagis ✨'
                }
            ]
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
    });
});

self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);
    event.notification.close();

    const clickAction = event.notification.data?.click_action || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then((focusedClient) => {
                        return focusedClient.navigate(clickAction);
                    });
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(clickAction);
            }
        })
    );
});
