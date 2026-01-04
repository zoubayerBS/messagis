"use client";

import { useEffect } from "react";
import { messaging } from "@/lib/firebase";
import { onMessage } from "firebase/messaging";

export function useNotifications() {
    useEffect(() => {
        const setup = async () => {
            const msg = await messaging();
            if (msg) {
                const unsubscribe = onMessage(msg, (payload) => {
                    console.log("💌 Nouveau message de ton amour", payload);
                    // Show a discrete notification if app is in foreground
                    if (Notification.permission === "granted") {
                        new Notification("Messagis", {
                            body: "💌 Nouveau message de ton amour",
                            icon: "/icons/icon-192x192.png",
                        });
                    }
                });
                return unsubscribe;
            }
        };

        setup();
    }, []);
}
