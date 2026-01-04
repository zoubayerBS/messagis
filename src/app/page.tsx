"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { MessageCircleCode } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else {
        router.push("/chat");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <MessageCircleCode className="w-12 h-12 text-[#FFFC00] fill-[#FFFC00] stroke-black stroke-[1.5px] animate-pulse" />
    </div>
  );
}
