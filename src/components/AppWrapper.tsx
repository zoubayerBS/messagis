"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import NotificationManager from "@/components/NotificationManager";

export default function AppWrapper({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            window.addEventListener("load", () => {
                navigator.serviceWorker
                    .register("/sw.js")
                    .then((registration) => {
                        console.log("SW registered: ", registration);
                    })
                    .catch((registrationError) => {
                        console.log("SW registration failed: ", registrationError);
                    });
            });
        }
    }, []);

    return (
        <AuthProvider>
            <NotificationManager />
            {children}
        </AuthProvider>
    );
}
