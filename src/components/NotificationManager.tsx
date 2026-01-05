"use client";

import { useEffect } from "react";
import { messaging } from "@/lib/firebase";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/components/AuthProvider";
import { updateFcmToken } from "@/actions/user";

export default function NotificationManager() {
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        const setupNotifications = async () => {
            try {
                const msg = await messaging();
                if (!msg) return;

                // Request permission
                console.log("Requesting notification permission...");
                const permission = await Notification.requestPermission();
                console.log("Permission status:", permission);
                if (permission === 'granted') {
                    // Get token
                    console.log("VAPID Key exists:", !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
                    const token = await getToken(msg, {
                        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
                    });

                    if (token) {
                        console.log("FCM Token obtained:", token.substring(0, 10) + "...");
                        const syncResult = await updateFcmToken(user.uid, token);
                        console.log("Token sync result:", syncResult);
                    } else {
                        console.log("No token obtained.");
                    }
                }

                // Handle foreground messages
                onMessage(msg, (payload) => {
                    console.log('Message received in foreground: ', payload);
                    // We do NOT show a system notification here because useChatSync
                    // already shows an in-app toast when we are in the foreground.
                });

            } catch (error) {
                console.error("Error setting up notifications:", error);
            }
        };

        setupNotifications();
    }, [user]);

    return null;
}
