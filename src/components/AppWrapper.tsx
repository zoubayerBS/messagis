"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import NotificationManager from "@/components/NotificationManager";

export default function AppWrapper({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const registerSW = () => {
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => {
                    console.log("SW registered: ", registration);
                })
                .catch((registrationError) => {
                    console.log("SW registration failed: ", registrationError);
                });
        };

        if ("serviceWorker" in navigator) {
            if (document.readyState === "complete") {
                registerSW();
            } else {
                window.addEventListener("load", registerSW);
                return () => window.removeEventListener("load", registerSW);
            }
        }
    }, []);

    return (
        <AuthProvider>
            <NotificationManager />
            {children}
        </AuthProvider>
    );
}
