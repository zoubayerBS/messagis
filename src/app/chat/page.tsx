"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import {
    sendMessage as sendMessageAction,
    getMessages as getMessagesAction,
    markMessageAsRead as markMessageAction,
    markConversationAsRead,
    deleteMessage,
    editMessage,
    toggleReaction,
    getChatSettings,
    toggleArchive,
    togglePin,
    clearConversation
} from "@/actions/chat";
import { syncUserAndCouple, getUserProfile } from "@/actions/user";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
    collection,
    query, // might be unused, check
    orderBy, // unused?
    onSnapshot, // KEY to remove
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    where, // Restored for status
    updateDoc // Restored for markAsRead (if we keep it synced) or remove usages
} from "firebase/firestore";
import {
    MoreVertical,
    Send,
    ChevronLeft,
    Lock,
    User,
    Smile,
    Trash2,
    Edit2,
    X,
    Check,
    Pin,
    Archive,
    MessageCircleCode
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ProtectedRoute from "@/components/ProtectedRoute";

interface Message {
    id: string;
    senderId: string;
    content: string;
    type: "text" | "image" | "audio";
    timestamp: any;
    read: boolean;
    isSelfDestructing?: boolean;
    scheduledFor?: any;
    isDeleted?: boolean;
    isEdited?: boolean;
    reactions?: any[];
}

import MediaUpload from "@/components/MediaUpload";
import VoiceRecorder from "@/components/VoiceRecorder";
import HeartAnimation from "@/components/HeartAnimation";
import VoiceMessage from "@/components/VoiceMessage";

export default function ChatPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState("");
    const [partnerStatus, setPartnerStatus] = useState({ isOnline: false, isTyping: false });
    const [partnerId, setPartnerId] = useState<string | null>(null);
    const [isSelfDestructNext, setIsSelfDestructNext] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPending, startTransition] = useTransition();
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [editInput, setEditInput] = useState("");
    const [showOptionsFor, setShowOptionsFor] = useState<string | null>(null);
    const [showEmojiPickerFor, setShowEmojiPickerFor] = useState<string | null>(null);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [chatSettings, setChatSettings] = useState<any>(null);
    const [lastFetchTime, setLastFetchTime] = useState<Date>(new Date());
    const [selectedImage, setSelectedImage] = useState<string | null>(null);



    const handleReaction = async (messageId: string, emoji: string) => {
        if (!user) return;
        await toggleReaction(messageId, emoji, user.uid);
        setShowEmojiPickerFor(null);
        setShowOptionsFor(null);
        // Optimistic update could be complex with nested includes, relying on poll/revalidate for now
    };

    const handleDelete = async (messageId: string) => {
        if (!user) return;
        if (confirm("Supprimer ce message ?")) {
            await deleteMessage(messageId, user.uid);
            setShowOptionsFor(null);
        }
    };

    const startEdit = (msg: Message) => {
        setEditingMessage(msg);
        setEditInput(msg.content);
        setShowOptionsFor(null);
    };

    const submitEdit = async () => {
        if (!user || !editingMessage) return;
        if (editInput.trim() !== editingMessage.content) {
            await editMessage(editingMessage.id, editInput, user.uid);
        }
        setEditingMessage(null);
        setEditInput("");
    };

    const [coupleId, setCoupleId] = useState<string | null>(null); // Keep for backward compat? Or just ignore.
    // New: Partner ID for direct messaging
    // We should get this from query param or props if we were using dynamic routing.
    // For now, let's assume we are fixing the "Couple" concept by just chatting with a "Target".
    // But wait, the user just said "like WhatsApp".
    // Usually you click a contact => /chat?uid=OTHER_UID
    // Let's grab it from URL search params.
    const searchParams = useSearchParams();
    const targetUserId = searchParams.get('uid');

    useEffect(() => {
        if (user && targetUserId) {
            getChatSettings(user.uid, targetUserId).then(res => {
                if (res.success) setChatSettings(res.settings);
            });
        }
    }, [user, targetUserId]);

    const handleToggleArchive = async () => {
        if (!user || !targetUserId) return;
        await toggleArchive(user.uid, targetUserId);
        setShowHeaderMenu(false);
        router.push('/chat-list');
    };

    const handleTogglePin = async () => {
        if (!user || !targetUserId) return;
        await togglePin(user.uid, targetUserId);
        setShowHeaderMenu(false);
        // Refresh local settings
        const res = await getChatSettings(user.uid, targetUserId);
        if (res.success) setChatSettings(res.settings);
    };

    const handleClearConversation = async () => {
        if (!user || !targetUserId) return;
        if (confirm("Supprimer toute la discussion ? (Ceci nettoiera votre vue uniquement)")) {
            await clearConversation(user.uid, targetUserId);
            setShowHeaderMenu(false);
            setMessages([]);
        }
    };

    useEffect(() => {
        if (!user) return;
        // Register online status
        const userStatusRef = doc(db, "status", user.uid);
        setDoc(userStatusRef, {
            isOnline: true,
            lastSeen: serverTimestamp(),
        }, { merge: true });

        return () => {
            setDoc(userStatusRef, { isOnline: false }, { merge: true });
        };
    }, [user]);

    // Listen for partner's status (Direct)
    useEffect(() => {
        if (!targetUserId) return;
        const partnerStatusRef = doc(db, "status", targetUserId);
        const unsubscribe = onSnapshot(partnerStatusRef, (docSnap) => {
            if (docSnap.exists()) {
                setPartnerStatus({
                    isOnline: docSnap.data().isOnline,
                    isTyping: docSnap.data().isTyping
                });
            }
        });
        return () => unsubscribe();
    }, [targetUserId]);

    const [partnerName, setPartnerName] = useState("Chargement...");

    useEffect(() => {
        if (!targetUserId) return;
        const fetchPartner = async () => {
            const res = await getUserProfile(targetUserId);
            if (res.success && res.user) {
                setPartnerName(res.user.username ? `@${res.user.username}` : res.user.email?.split('@')[0] || "Utilisateur");
            } else {
                setPartnerName("Utilisateur");
            }
        };
        fetchPartner();
    }, [targetUserId]);

    // Load and Sync Messages (Direct Message)
    useEffect(() => {
        if (!user || !targetUserId) return;

        const syncMessages = async () => {
            const res = await getMessagesAction(user.uid, targetUserId);
            if (res.success && res.messages) {
                setMessages(res.messages as any[]);
                setLastFetchTime(new Date());

                // Mark as read if we have unread messages from this partner
                const hasUnread = res.messages.some((m: any) => m.senderId === targetUserId && !m.read);
                if (hasUnread) {
                    await markConversationAsRead(user.uid, targetUserId);
                }
            }
        };

        // Initial load
        syncMessages();

        // Real-time listener via Firestore signal
        const chatId = [user.uid, targetUserId].sort().join('_');
        const signalRef = doc(db, "chatSignals", chatId);

        const unsubscribe = onSnapshot(signalRef, (docSnap) => {
            if (docSnap.exists()) {
                console.log("New message signal received, refreshing...");
                syncMessages();
            }
        });

        // Backup polling (less frequent, every 10s) just in case
        const backupInterval = setInterval(syncMessages, 10000);

        return () => {
            unsubscribe();
            clearInterval(backupInterval);
        };
    }, [user, targetUserId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, partnerStatus.isTyping]);

    const handleTyping = (text: string) => {
        setInputText(text);
        if (!user) return;
        setDoc(doc(db, "status", user.uid), { isTyping: text.length > 0 }, { merge: true });
    };

    const sendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || !user || !targetUserId) return;

        const content = inputText;
        setInputText("");

        // Reset typing status
        setDoc(doc(db, "status", user.uid), { isTyping: false }, { merge: true });

        try {
            const res = await sendMessageAction({
                content,
                type: "text",
                senderId: user.uid,
                receiverId: targetUserId,
                isSelfDestructing: isSelfDestructNext
            });

            if (res.success && res.message) {
                const newMsg: any = res.message;
                setMessages((prev) => {
                    if (prev.find(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            } else {
                console.error("Failed to save to Prisma:", res.error);
            }
        } catch (err) {
            console.error("Prisma action error:", err);
        }

        setIsSelfDestructNext(false);
    };

    const markAsRead = async (id: string) => {
        try {
            // Prisma only (Firestore removed)
            await markMessageAction(id);

            // Optimistic update locally
            setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    };

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-white font-sans overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-4 border-b border-gray-100 bg-white z-10">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => router.push("/chat-list")}
                            className="p-1 hover:bg-gray-100 rounded-full transition-colors mr-1"
                        >
                            <ChevronLeft className="w-7 h-7 text-[#00B9FF]" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#FFFC00] flex items-center justify-center border-2 border-black">
                                <User className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-black uppercase tracking-tighter">{partnerName}</h1>
                                <p className={`text-[10px] uppercase font-bold tracking-widest ${partnerStatus.isOnline ? "text-[#00B9FF]" : "text-gray-400"}`}>
                                    {partnerStatus.isOnline ? "En ligne" : "Hors ligne"}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div
                            role="button"
                            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors relative cursor-pointer"
                        >
                            <MoreVertical className="w-5 h-5 text-gray-600" />

                            <AnimatePresence>
                                {showHeaderMenu && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                                        className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[100]"
                                    >
                                        <button
                                            onClick={handleTogglePin}
                                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors"
                                        >
                                            <Pin className={`w-4 h-4 ${chatSettings?.isPinned ? "text-blue-500 fill-blue-500" : "text-gray-400"}`} />
                                            {chatSettings?.isPinned ? "Désépingler" : "Marquer (Épingler)"}
                                        </button>
                                        <button
                                            onClick={handleToggleArchive}
                                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors"
                                        >
                                            <Archive className="w-4 h-4 text-gray-400" />
                                            Archiver la discussion
                                        </button>
                                        <div className="my-1 border-t border-gray-100" />
                                        <button
                                            onClick={handleClearConversation}
                                            className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors text-red-500 font-medium"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Supprimer la discussion
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </header>

                {/* Messages Window */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth bg-[#fafafa]"
                >
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => {
                            const isMe = msg.senderId === user?.uid;
                            const isEditing = editingMessage?.id === msg.id;

                            // Reactions Grouping
                            const reactionsMap = new Map();
                            msg.reactions?.forEach((r: any) => {
                                const count = reactionsMap.get(r.emoji) || 0;
                                reactionsMap.set(r.emoji, count + 1);
                            });

                            return (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    className={`flex flex-col ${isMe ? "items-end" : "items-start"} relative group`}
                                >
                                    <div className={`relative max-w-[85%] ${isMe ? "flex flex-row-reverse" : "flex flex-row"} items-end gap-2`}>

                                        {/* Option Menu Overlay - Moved outside overflow-hidden */}
                                        {showOptionsFor === msg.id && (
                                            <div className={`absolute z-50 bottom-full mb-2 ${isMe ? "right-0" : "left-0"} bg-white shadow-xl border border-gray-100 rounded-xl p-1 flex gap-1 min-w-[150px] animate-in zoom-in-50 duration-200`}>
                                                <div className="flex gap-1 p-1 bg-gray-50 rounded-lg">
                                                    {["❤️", "😂", "😮", "😢", "👍"].map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => handleReaction(msg.id, emoji)}
                                                            className="hover:scale-125 transition-transform text-lg"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                                {isMe && !msg.read && msg.type === "text" && (
                                                    <button onClick={() => startEdit(msg)} className="p-2 hover:bg-gray-100 rounded-lg text-blue-500">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {isMe && (
                                                    <button onClick={() => handleDelete(msg.id)} className="p-2 hover:bg-gray-100 rounded-lg text-red-500">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => setShowOptionsFor(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        {/* Message Bubble */}
                                        <div
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                if (!msg.isDeleted) setShowOptionsFor(msg.id);
                                            }}
                                            className={`relative rounded-[20px] shadow-sm text-sm overflow-hidden 
                                                ${isMe ? "bg-[#00B9FF] text-white rounded-br-none" : "bg-[#F3F3F3] text-black rounded-bl-none"}
                                                ${msg.isDeleted ? "italic opacity-60 bg-gray-100 text-gray-400" : ""}
                                                ${msg.isSelfDestructing && !isMe && !msg.read ? "cursor-pointer active:scale-95 transition-transform" : ""}
                                            `}
                                        >
                                            {/* Removed internal menu coding from here */}

                                            {msg.isSelfDestructing && (
                                                <div className="absolute top-1.5 right-2">
                                                    <MessageCircleCode className={`w-3.5 h-3.5 ${isMe ? "text-white fill-white stroke-black stroke-[0.5px]" : "text-[#FFFC00] fill-[#FFFC00] stroke-black stroke-[1px]"} animate-pulse`} />
                                                </div>
                                            )}

                                            {msg.isDeleted ? (
                                                <div className="px-4 py-2.5 flex items-center gap-2">
                                                    <X className="w-3 h-3" /> Ce message a été supprimé
                                                </div>
                                            ) : isEditing ? (
                                                <div className="px-2 py-2 flex items-center bg-white rounded-xl m-1">
                                                    <input
                                                        value={editInput}
                                                        onChange={e => setEditInput(e.target.value)}
                                                        className="bg-transparent text-black outline-none min-w-[200px]"
                                                        autoFocus
                                                    />
                                                    <button onClick={submitEdit} className="p-1 bg-green-500 text-white rounded-full ml-2"><Check className="w-3 h-3" /></button>
                                                    <button onClick={() => setEditingMessage(null)} className="p-1 bg-red-500 text-white rounded-full ml-1"><X className="w-3 h-3" /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    {msg.type === "text" && (
                                                        <div className="px-4 py-2.5">
                                                            {msg.isSelfDestructing ? (
                                                                !msg.read ? (
                                                                    isMe ? (
                                                                        <p className="font-medium leading-tight text-[15px] italic opacity-80">Message éphémère envoyé</p>
                                                                    ) : (
                                                                        <div onClick={() => markAsRead(msg.id)} className="cursor-pointer">
                                                                            <p className="italic opacity-60 flex items-center gap-2">
                                                                                <Lock className="w-3 h-3" /> Appuie pour voir le secret
                                                                            </p>
                                                                        </div>
                                                                    )
                                                                ) : (
                                                                    <p className="italic opacity-40 text-xs">Message expiré</p>
                                                                )
                                                            ) : (
                                                                <p className="font-medium leading-tight text-[15px] whitespace-pre-wrap">{msg.content}</p>
                                                            )}
                                                            {msg.isEdited && !msg.isSelfDestructing && (
                                                                <span className="text-[10px] opacity-60 italic ml-1">(modifié)</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {msg.type === "image" && (
                                                        <div className="p-1">
                                                            {msg.isSelfDestructing && !isMe && !msg.read ? (
                                                                <div onClick={() => markAsRead(msg.id)} className="w-full h-32 bg-gray-200 flex items-center justify-center rounded-[15px] cursor-pointer">
                                                                    <Lock className="w-6 h-6 text-gray-400" />
                                                                </div>
                                                            ) : msg.isSelfDestructing && msg.read ? (
                                                                <div className="px-4 py-2 text-xs italic opacity-40">Photo expirée</div>
                                                            ) : (
                                                                <img
                                                                    src={msg.content}
                                                                    alt="Shared"
                                                                    className="rounded-[15px] max-h-64 w-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={() => setSelectedImage(msg.content)}
                                                                />
                                                            )}
                                                        </div>
                                                    )}

                                                    {msg.type === "audio" && (
                                                        <div className="px-2 py-1">
                                                            {msg.isSelfDestructing && msg.read ? (
                                                                <p className="text-xs italic opacity-40 px-3 py-2">Audio expiré</p>
                                                            ) : (
                                                                <VoiceMessage url={msg.content} isMe={isMe} />
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            <div className={`px-3 pb-2 flex items-center gap-1 ${isMe ? "justify-end" : "justify-start"}`}>
                                                <span className={`text-[9px] font-bold uppercase ${isMe ? "text-white/60" : "text-gray-400"}`}>
                                                    {msg.timestamp?.toDate
                                                        ? format(msg.timestamp.toDate(), "HH:mm", { locale: fr })
                                                        : msg.timestamp
                                                            ? format(new Date(msg.timestamp), "HH:mm", { locale: fr })
                                                            : "..."}
                                                </span>
                                                {isMe && (
                                                    <div className={`w-1.5 h-1.5 rounded-full ${msg.read ? "bg-white" : "bg-white/30"}`} />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Reactions Display */}
                                    {reactionsMap.size > 0 && !msg.isDeleted && (
                                        <div className={`flex gap-1 mt-1 ${isMe ? "mr-2" : "ml-2"}`}>
                                            {Array.from(reactionsMap.entries()).map(([emoji, count]) => (
                                                <div key={emoji} className="bg-white border border-gray-100 rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-1">
                                                    <span>{emoji}</span>
                                                    {count > 1 && <span className="font-bold text-gray-500">{count}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Typing indicator */}
                    {partnerStatus.isTyping && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2"
                        >
                            <HeartAnimation />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Écrit un chat...</span>
                        </motion.div>
                    )}
                </div>

                {/* Input Bar */}
                <div className="px-4 py-5 bg-white border-t border-gray-100 pb-[calc(env(safe-area-inset-bottom)+10px)]">
                    <div className="flex gap-2 mb-3">
                        <button
                            type="button"
                            onClick={() => setIsSelfDestructNext(!isSelfDestructNext)}
                            className={`text-[9px] font-black uppercase px-3 py-1 rounded-full border-2 transition-all ${isSelfDestructNext ? "bg-[#FFFC00] text-black border-black shadow-[0_2px_0_black]" : "bg-white text-gray-400 border-gray-200"
                                }`}
                        >
                            {isSelfDestructNext ? "lecture unique active" : "lecture unique"}
                        </button>
                    </div>
                    <form onSubmit={sendMessage} className="flex items-center gap-2">
                        <MediaUpload user={user} receiverId={targetUserId || ""} isSelfDestructing={isSelfDestructNext} />

                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Envoyer un Chat"
                                value={inputText}
                                onChange={(e) => handleTyping(e.target.value)}
                                className="w-full pl-5 pr-12 py-3 bg-[#F3F3F3] border-none rounded-full focus:ring-0 outline-none transition-all placeholder:text-gray-400 text-black font-bold text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!inputText.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#00B9FF] text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-md"
                            >
                                <Send className="w-3.5 h-3.5 fill-white" />
                            </button>
                        </div>

                        <VoiceRecorder user={user} receiverId={targetUserId || ""} isSelfDestructing={isSelfDestructNext} />
                    </form>
                </div>
            </div>

            {/* Image Zoom Modal */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedImage(null)}
                        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
                    >
                        <motion.button
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X className="w-8 h-8" />
                        </motion.button>

                        <motion.img
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            src={selectedImage}
                            alt="Full Preview"
                            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </ProtectedRoute>
    );
}
