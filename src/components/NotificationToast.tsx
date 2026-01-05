"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, User } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationToastProps {
    show: boolean;
    title: string;
    body: string;
    senderId: string;
    onClose: () => void;
}

export default function NotificationToast({ show, title, body, senderId, onClose }: NotificationToastProps) {
    const router = useRouter();

    const handleClick = () => {
        router.push(`/chat?uid=${senderId}`);
        onClose();
    };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: -100, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -100, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="fixed top-4 right-4 z-[9999] w-80 bg-white rounded-2xl shadow-2xl border-2 border-black overflow-hidden cursor-pointer"
                    onClick={handleClick}
                >
                    <div className="p-4 flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-[#FFFC00] flex items-center justify-center border-2 border-black flex-shrink-0">
                            <User className="w-6 h-6 text-black" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-black uppercase tracking-tight truncate">
                                {title}
                            </h3>
                            <p className="text-xs text-gray-600 font-medium mt-1 line-clamp-2">
                                {body}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="p-1 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                    <div className="h-1 bg-[#00B9FF]" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
