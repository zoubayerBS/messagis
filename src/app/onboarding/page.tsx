"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { MessageCircleCode, Sparkles, Lock } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function OnboardingPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [code, setCode] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleStart = async () => {
        if (!user || code.trim().length < 3) return;

        setIsSaving(true);
        try {
            // Use the secret code as the coupleId (clean it up slightly)
            const cleanCode = code.trim().toLowerCase();

            const userRef = doc(db, "users", user.uid);
            await setDoc(userRef, {
                email: user.email,
                coupleId: cleanCode,
                lastSeen: serverTimestamp(),
                setupAt: serverTimestamp()
            }, { merge: true });

            router.push("/chat-list");
        } catch (error) {
            console.error("Error setting up couple:", error);
            setIsSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white text-center font-sans">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="w-full max-w-sm space-y-12"
                >
                    {/* Snapchat-style Icon */}
                    <div className="relative inline-block">
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                rotate: [0, 5, -5, 0]
                            }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="bg-[#FFFC00] p-8 rounded-[2rem] shadow-xl border-4 border-black relative z-10"
                        >
                            <MessageCircleCode className="w-16 h-16 text-black fill-black" />
                        </motion.div>
                        <div className="absolute -top-4 -right-4 text-[#00B9FF]">
                            <Sparkles className="w-8 h-8 animate-pulse" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-4xl font-black uppercase tracking-tighter text-black">
                            Lien Secret
                        </h1>
                        <p className="text-gray-500 font-bold max-w-xs mx-auto text-sm uppercase tracking-widest leading-relaxed">
                            Choisis un code secret avec ton partenaire pour vous lier à jamais.
                        </p>
                    </div>

                    {/* Input Field */}
                    <div className="space-y-6 relative">
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                <Lock className="w-5 h-5" />
                            </div>
                            <input
                                type="text"
                                placeholder="VOTRE CODE SECRET"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                className="w-full bg-[#F3F3F3] border-none rounded-2xl py-5 pl-12 pr-6 text-center font-black text-xl tracking-[0.3em] focus:ring-4 focus:ring-[#FFFC00] transition-all placeholder:text-gray-300 placeholder:tracking-normal uppercase"
                            />
                        </div>

                        <AnimatePresence>
                            {code.length >= 3 && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={handleStart}
                                    disabled={isSaving}
                                    className="w-full py-5 bg-black text-[#FFFC00] rounded-2xl font-black uppercase tracking-widest text-lg shadow-[0_10px_0_rgb(0,0,0,0.2)] active:shadow-none active:translate-y-[4px] transition-all disabled:opacity-50"
                                >
                                    {isSaving ? "Synchronisation..." : "Se connecter maintenant"}
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>

                    <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest mt-8">
                        L'autre personne doit saisir EXACTEMENT le même code.
                    </p>
                </motion.div>
            </div>
        </ProtectedRoute>
    );
}
