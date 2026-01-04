"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Heart } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="absolute -inset-10 bg-[#fffc00]/20 blur-3xl rounded-full animate-pulse" />
                    <Heart className="w-12 h-12 text-[#fffc00] fill-[#fffc00] stroke-black stroke-2 animate-pulse relative z-10" />
                </div>
                <p className="mt-4 text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">
                    Vérification de l'accès...
                </p>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect via useEffect
    }

    return <>{children}</>;
}
