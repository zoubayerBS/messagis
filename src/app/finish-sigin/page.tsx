"use client";

import { useEffect, useState } from "react";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { MessageCircleCode } from "lucide-react";

export default function FinishSignIn() {
    const router = useRouter();
    const [status, setStatus] = useState("Vérification du lien secret...");

    useEffect(() => {
        if (isSignInWithEmailLink(auth, window.location.href)) {
            let email = window.localStorage.getItem("emailForSignIn");

            if (!email) {
                email = window.prompt("S'il te plaît, confirme ton adresse email pour la connexion");
            }

            if (email) {
                signInWithEmailLink(auth, email, window.location.href)
                    .then(() => {
                        window.localStorage.removeItem("emailForSignIn");
                        setStatus("Connexion réussie ! Redirection...");
                        setTimeout(() => router.push("/"), 2000);
                    })
                    .catch((error) => {
                        setStatus("Erreur lors de la connexion : " + error.message);
                    });
            }
        }
    }, [router]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
            <div className="text-center space-y-6">
                <MessageCircleCode className="w-12 h-12 text-[#FFFC00] fill-[#FFFC00] stroke-black stroke-[1.5px] animate-pulse mx-auto" />
                <h1 className="text-xs font-black text-black uppercase tracking-widest">{status}</h1>
            </div>
        </div>
    );
}
