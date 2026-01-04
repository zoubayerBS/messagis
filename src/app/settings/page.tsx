"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getUserProfile, updateUsername } from "@/actions/user";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { User, LogOut, Check, Loader2, AtSign, Lock, Shield } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { doc, setDoc } from "firebase/firestore";

export default function SettingsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Password Change State
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        const fetchProfile = async () => {
            const res = await getUserProfile(user.uid);
            if (res.success && res.user) {
                setUsername(res.user.username || "");
            }
            setLoading(false);
        };
        fetchProfile();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setError("");
        setSuccess(false);

        const res = await updateUsername(user.uid, username);
        if (res.success) {
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } else {
            setError(res.error as string || "Erreur lors de la sauvegarde.");
        }
        setSaving(false);
    };

    const handleChangePassword = async () => {
        if (!user || !user.email) return;
        setPasswordSaving(true);
        setPasswordError("");
        setPasswordSuccess("");

        if (newPassword.length < 6) {
            setPasswordError("Le nouveau mot de passe doit faire au moins 6 caractères.");
            setPasswordSaving(false);
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            setPasswordSuccess("Mot de passe mis à jour avec succès !");
            setTimeout(() => {
                setIsChangingPassword(false);
                setCurrentPassword("");
                setNewPassword("");
                setPasswordSuccess("");
            }, 2000);
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setPasswordError("Mot de passe actuel incorrect.");
            } else {
                setPasswordError("Erreur lors de la mise à jour du mot de passe.");
            }
        }
        setPasswordSaving(false);
    };

    const handleLogout = async () => {
        try {
            if (user) {
                // Mark offline
                const userStatusRef = doc(db, "status", user.uid);
                await setDoc(userStatusRef, { isOnline: false }, { merge: true });
            }
            await signOut(auth);
            router.push("/login");
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-white font-sans text-black overflow-hidden lg:max-w-md lg:mx-auto lg:border-x lg:border-gray-100">
                <header className="px-4 py-4 flex items-center justify-between border-b border-gray-100 bg-white">
                    <div className="w-8" />
                    <h1 className="text-xl font-black uppercase tracking-tight">Paramètres</h1>
                    <div className="w-8" />
                </header>

                <main className="flex-1 overflow-y-auto p-6 space-y-8">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                        </div>
                    ) : (
                        <>
                            {/* Profile Section */}
                            <div className="flex flex-col items-center space-y-4">
                                <div className="w-24 h-24 rounded-full bg-[#FFFC00] border-2 border-black flex items-center justify-center">
                                    <User className="w-10 h-10 text-black" />
                                </div>
                                <p className="text-sm font-bold text-gray-400">{user?.email}</p>
                            </div>

                            {/* Username Form */}
                            <div className="space-y-4">
                                <label className="block text-xs font-black uppercase tracking-widest text-gray-500 ml-1">
                                    Nom d'utilisateur
                                </label>
                                <div className="relative">
                                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                                        placeholder="pseudo"
                                        className="w-full h-14 pl-12 pr-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black focus:bg-white focus:outline-none transition-all"
                                    />
                                </div>

                                {error && (
                                    <p className="text-red-500 text-xs font-bold ml-1">{error}</p>
                                )}

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="w-full h-14 bg-black text-white rounded-2xl font-bold uppercase tracking-widest hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
                                >
                                    {saving ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : success ? (
                                        <>
                                            <Check className="w-5 h-5" /> Enregistré
                                        </>
                                    ) : (
                                        "Enregistrer"
                                    )}
                                </button>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Security Section (Password Change) */}
                            <div className="space-y-4">
                                <div
                                    onClick={() => setIsChangingPassword(!isChangingPassword)}
                                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Shield className="w-5 h-5 text-black" />
                                        <span className="font-bold text-sm">Sécurité</span>
                                    </div>
                                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">
                                        {isChangingPassword ? "Fermer" : "Modifier mot de passe"}
                                    </span>
                                </div>

                                {isChangingPassword && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="Mot de passe actuel"
                                                className="w-full h-12 pl-12 pr-4 bg-white border-2 border-gray-100 rounded-xl font-medium focus:border-black focus:outline-none transition-all"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Nouveau mot de passe"
                                                className="w-full h-12 pl-12 pr-4 bg-white border-2 border-gray-100 rounded-xl font-medium focus:border-black focus:outline-none transition-all"
                                            />
                                        </div>

                                        {passwordError && (
                                            <p className="text-red-500 text-xs font-bold ml-1">{passwordError}</p>
                                        )}
                                        {passwordSuccess && (
                                            <p className="text-green-600 text-xs font-bold ml-1">{passwordSuccess}</p>
                                        )}

                                        <button
                                            onClick={handleChangePassword}
                                            disabled={passwordSaving || !currentPassword || !newPassword}
                                            className="w-full h-12 bg-black text-white rounded-xl font-bold uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mettre à jour"}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <hr className="border-gray-100" />

                            {/* Logout */}
                            <button
                                onClick={handleLogout}
                                className="w-full h-14 bg-red-50 text-red-500 rounded-2xl font-bold uppercase tracking-widest hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-5 h-5" />
                                Se déconnecter
                            </button>
                        </>
                    )}
                </main>
            </div>
        </ProtectedRoute>
    );
}
