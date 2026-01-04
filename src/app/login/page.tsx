"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { MessageCircleCode } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/chat-list");
        } catch (err: any) {
            if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
                setError("Email ou mot de passe incorrect.");
            } else if (err.code === "auth/invalid-email") {
                setError("Adresse email invalide.");
            } else {
                setError("Erreur : " + err.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col font-sans overflow-hidden">
            {/* Logo area with Glassmorphism & Motion */}
            <div className="flex-1 flex flex-col items-center justify-center pb-20">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="relative"
                >
                    {/* Glass background effect */}
                    <div className="absolute -inset-10 bg-[#fffc00]/20 blur-3xl rounded-full animate-pulse" />

                    <motion.div
                        animate={{
                            scale: [1, 1.1, 1],
                        }}
                        transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="relative z-10 w-[120px] h-[120px] bg-white/40 backdrop-blur-xl border border-white/40 rounded-[30%] flex items-center justify-center shadow-2xl overflow-hidden"
                    >
                        <MessageCircleCode className="w-[60px] h-[60px] text-[#fffc00] fill-[#fffc00] stroke-black stroke-2 drop-shadow-lg" />
                    </motion.div>
                </motion.div>

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-8 text-4xl font-black text-black tracking-tighter uppercase"
                >
                    Messagis
                </motion.h1>
            </div>

            {/* Bottom Form area */}
            <div className="w-full">
                <form onSubmit={handleLogin} className="w-full flex flex-col">
                    <div className="px-8 space-y-6 mb-8">
                        <div className="group space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-blue-500">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full border-b-2 border-gray-100 py-2 text-[18px] font-bold text-black outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div className="group space-y-1 relative">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-blue-500">Mot de passe</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full border-b-2 border-gray-100 py-2 pr-12 text-[18px] font-bold text-black outline-none focus:border-blue-500 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors"
                                >
                                    {showPassword ? "Cacher" : "Voir"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.p
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-red-600 text-[12px] mb-4 font-bold uppercase text-center px-8"
                            >
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-6 bg-[#00B9FF] text-white text-[18px] font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-[#00a3e0] border-t-4 border-black transition-all disabled:opacity-50"
                    >
                        {isLoading ? "Vérification..." : "Connexion"}
                    </button>
                </form>

                <div className="bg-white py-6 text-center">
                    <Link href="/signup" className="text-[12px] text-black font-black uppercase tracking-widest hover:underline">
                        Nouveau ? Créer un compte
                    </Link>
                </div>
            </div>
        </div>
    );
}
