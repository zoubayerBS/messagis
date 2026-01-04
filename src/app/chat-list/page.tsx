"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getRecentChats } from "@/actions/chat";
import { db } from "@/lib/firebase";
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
    MessageSquare,
    Search,
    User,
    UserPlus,
    Camera,
    LogOut,
    Circle,
    MessageSquareDashed,
    MessageCircleCode,
    X
} from "lucide-react";
import { searchUsers } from "@/actions/user";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ProtectedRoute from "@/components/ProtectedRoute";

interface ChatPartner {
    id: string;
    name: string;
    email?: string;
    isOnline: boolean;
    lastMessage?: {
        content: string;
        timestamp: any;
        senderId: string;
        read: boolean;
    };
}

export default function ChatListPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [chats, setChats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Sync online status
    useEffect(() => {
        if (!user) return;
        const userStatusRef = doc(db, "status", user.uid);
        setDoc(userStatusRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true });
        return () => {
            setDoc(userStatusRef, { isOnline: false }, { merge: true });
        };
    }, [user]);

    // Fetch and sync Recent Chats in real-time
    useEffect(() => {
        if (!user) return;

        const fetchChats = async () => {
            const res = await getRecentChats(user.uid);
            if (res.success && res.chats) {
                setChats(res.chats);
            }
            setLoading(false);
        };

        // Initial fetch
        fetchChats();

        // Real-time listener via user-specific signal
        const signalRef = doc(db, "userSignals", user.uid);
        const unsubscribe = onSnapshot(signalRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log("Chat list update signal received, refreshing...");
                fetchChats();
            }
        });

        // Backup polling (every 15s)
        const backupInterval = setInterval(fetchChats, 15000);

        return () => {
            unsubscribe();
            clearInterval(backupInterval);
        };
    }, [user]);

    const getStatusIcon = (chat: any) => {
        const isMe = chat.lastMessage.senderId === user?.uid;
        if (isMe) {
            return chat.lastMessage.read
                ? <div className="w-5 h-5 rounded-[4px] border-2 border-[#00B9FF] flex items-center justify-center"><div className="w-2 h-2 bg-[#00B9FF] rounded-sm" /></div>
                : <div className="w-5 h-5 bg-[#00B9FF] rounded-[4px]" />;
        } else {
            return chat.lastMessage.read
                ? <div className="w-5 h-5 rounded-[4px] border-2 border-[#FF0049] flex items-center justify-center ml-1"><div className="w-2 h-2 bg-[#FF0049] rounded-sm" /></div>
                : <div className="w-5 h-5 bg-[#FF0049] rounded-[4px] ml-1" />;
        }
    };

    const getStatusText = (chat: any) => {
        const isMe = chat.lastMessage.senderId === user?.uid;
        const time = chat.lastMessage.timestamp // Handle date format
            ? format(new Date(chat.lastMessage.timestamp), "HH:mm", { locale: fr })
            : "...";

        if (isMe) {
            if (chat.lastMessage.type === 'image') return `Photo envoyée • ${time}`;
            if (chat.lastMessage.type === 'audio') return `Vocal envoyé • ${time}`;
            return `Envoyé • ${time}`;
        } else {
            if (chat.lastMessage.type === 'image') return `Photo reçue • ${time}`;
            if (chat.lastMessage.type === 'audio') return `Vocal reçu • ${time}`;
            return chat.lastMessage.read ? `Reçu • ${time}` : `Nouveau message • ${time}`;
        }
    };

    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        const delayDebounce = setTimeout(async () => {
            if (searchQuery.length >= 3) {
                setSearchLoading(true);
                const res = await searchUsers(searchQuery);
                if (res.success && res.users) {
                    // Filter out current user
                    setSearchResults(res.users.filter((u: any) => u.uid !== user?.uid));
                }
                setSearchLoading(false);
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, user]);

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-white font-sans text-black overflow-hidden lg:max-w-md lg:mx-auto lg:border-x lg:border-gray-100 relative">
                {/* Header */}
                <header className="px-4 py-4 flex items-center justify-between border-b border-gray-100 bg-white z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push("/settings")}>
                            <User className="w-8 h-8 text-black" />
                        </button>
                    </div>
                    <h1 className="text-xl font-black uppercase tracking-tight">Chats</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsNewChatOpen(true)}
                            className="bg-gray-100 w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <MessageSquare className="w-5 h-5 text-black" />
                        </button>
                    </div>
                </header>

                {/* Chat List */}
                <main className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-8 bg-white">
                            <div className="relative">
                                <motion.div
                                    animate={{
                                        scale: [1, 2],
                                        opacity: [0.3, 0]
                                    }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                    className="absolute inset-0 bg-[#FFFC00] rounded-full blur-2xl"
                                />
                                <motion.div
                                    animate={{
                                        scale: [1, 1.2, 1],
                                    }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="relative"
                                >
                                    <MessageCircleCode className="w-16 h-16 text-[#FFFC00] fill-[#FFFC00] stroke-black stroke-[2px] drop-shadow-xl" />
                                </motion.div>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <motion.p
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-[10px] font-black text-black uppercase tracking-[0.3em] ml-[0.3em]"
                                >
                                    Chargement
                                </motion.p>
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <motion.div
                                            key={i}
                                            animate={{ y: [0, -3, 0], scale: [1, 1.2, 1] }}
                                            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                                            className="w-1 h-1 bg-black rounded-full"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : chats.length > 0 ? (
                        chats.map((chat) => (
                            <motion.div
                                key={chat.partnerId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => router.push(`/chat?uid=${chat.partnerId}`)}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer border-b border-gray-50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-full bg-[#FFFC00] border-2 border-black flex items-center justify-center">
                                            <User className="w-7 h-7 text-black fill-black" />
                                        </div>
                                        {chat.lastMessage.senderId !== user?.uid && !chat.lastMessage.read && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF0049] rounded-full border-2 border-white flex items-center justify-center animate-bounce">
                                                <div className="w-2 h-2 bg-white rounded-full" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col">
                                        <h3 className="font-bold text-base leading-tight">
                                            {chat.partnerUsername ? `@${chat.partnerUsername}` : (chat.partnerEmail || "Utilisateur")}
                                        </h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {getStatusIcon(chat)}
                                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-tighter">
                                                {getStatusText(chat)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <Camera className="w-6 h-6 text-gray-300 hover:text-black transition-colors" />
                            </motion.div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-6">
                            <div className="relative overflow-hidden bg-white/40 backdrop-blur-xl border border-white/60 p-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 text-center max-w-sm w-full mx-4">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                                <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center shadow-inner relative z-10">
                                    <MessageSquareDashed className="w-10 h-10 text-gray-400" />
                                </div>
                                <div className="space-y-2 relative z-10">
                                    <h3 className="text-lg font-black uppercase text-gray-600 tracking-tight">C'est bien calme...</h3>
                                    <p className="text-xs font-medium text-gray-500 leading-relaxed px-4">
                                        Cliquez sur l'icône de message pour démarrer une discussion.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                {/* New Chat Modal/Overlay */}
                {isNewChatOpen && (
                    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
                        <header className="px-4 py-4 flex items-center justify-between border-b border-gray-100">
                            <h2 className="text-lg font-black uppercase">Nouvelle Discussion</h2>
                            <button onClick={() => setIsNewChatOpen(false)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                <X className="w-5 h-5" />
                            </button>
                        </header>
                        <div className="p-4">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text" autoComplete="off"
                                    placeholder="Rechercher par email ou nom d'utilisateur..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-12 pl-12 pr-4 bg-gray-100 rounded-2xl font-medium focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4">
                            {searchLoading ? (
                                <div className="text-center py-8 text-gray-400 text-sm font-bold">Recherche...</div>
                            ) : searchResults.length > 0 ? (
                                <div className="space-y-2">
                                    {searchResults.map(result => (
                                        <div
                                            key={result.uid}
                                            onClick={() => router.push(`/chat?uid=${result.uid}`)}
                                            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-[#FFFC00] border border-black flex items-center justify-center">
                                                <User className="w-6 h-6 text-black" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm">{result.username ? `@${result.username}` : result.email}</p>
                                                <p className="text-xs text-gray-400 font-medium">Lancer la discussion</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : searchQuery.length >= 3 ? (
                                <div className="text-center py-8 text-gray-400 text-sm font-bold">Aucun utilisateur trouvé.</div>
                            ) : (
                                <div className="text-center py-8 text-gray-300 text-xs font-bold uppercase tracking-widest">
                                    Tapez au moins 3 caractères
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
