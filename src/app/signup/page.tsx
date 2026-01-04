"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { MessageCircleCode } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { syncUserAndCouple } from "@/actions/user";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }

        if (password.length < 6) {
            setError("Le mot de passe doit faire au moins 6 caractères.");
            return;
        }

        setIsLoading(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Sync with Prisma
            await syncUserAndCouple({
                uid: user.uid,
                email: user.email || "",
                coupleId: null
            });

            router.push("/chat-list");
        } catch (err: any) {
            if (err.code === "auth/email-already-in-use") {
                setError("Cet email est déjà utilisé.");
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
            {/* Logo area */}
            <div className="flex-1 flex flex-col items-center justify-center py-12">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="relative"
                >
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
                        className="relative z-10 w-[100px] h-[100px] bg-[#fffc00] border-4 border-black rounded-[30%] flex items-center justify-center shadow-xl"
                    >
                        <MessageCircleCode className="w-[50px] h-[50px] text-black fill-black" />
                    </motion.div>
                </motion.div>

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 text-3xl font-black text-black tracking-tighter uppercase"
                >
                    Créer un compte
                </motion.h1>
            </div>

            {/* Form area */}
            <div className="w-full">
                <form onSubmit={handleSignup} className="w-full flex flex-col">
                    <div className="px-8 space-y-4 mb-8">
                        <div className="group space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full border-b-2 border-gray-100 py-2 text-[16px] font-bold text-black outline-none focus:border-[#fffc00] transition-all"
                            />
                        </div>
                        <div className="group space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mot de passe</label>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full border-b-2 border-gray-100 py-2 text-[16px] font-bold text-black outline-none focus:border-[#fffc00] transition-all"
                            />
                        </div>
                        <div className="group space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Confirmer le mot de passe</label>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full border-b-2 border-gray-100 py-2 text-[16px] font-bold text-black outline-none focus:border-[#fffc00] transition-all"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors ml-1"
                        >
                            {showPassword ? "Cacher" : "Voir les mots de passe"}
                        </button>
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
                        className="w-full py-6 bg-[#fffc00] text-black text-[18px] font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-[#efe600] border-t-4 border-black transition-all disabled:opacity-50"
                    >
                        {isLoading ? "Inscription..." : "S'inscrire"}
                    </button>
                </form>

                <div className="bg-white py-6 text-center">
                    <Link href="/login" className="text-[12px] text-black font-black uppercase tracking-widest hover:underline">
                        Déjà un compte ? Connexion
                    </Link>
                </div>
            </div>
        </div>
    );
}
