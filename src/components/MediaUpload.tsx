"use client";

import { Camera } from "lucide-react";
// Removed Firebase Storage/Firestore imports as we use Base64 + Prisma now
import { sendMessage } from "@/actions/chat";

export default function MediaUpload({ user, receiverId, isSelfDestructing }: { user: any, receiverId: string, isSelfDestructing: boolean }) {
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        try {
            // Convert file to Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Url = reader.result as string;

                // Save to Prisma (Base64 content)
                await sendMessage({
                    content: base64Url,
                    type: "image",
                    senderId: user.uid,
                    receiverId, // renamed prop
                    isSelfDestructing // Use prop
                });
            };
            reader.onerror = (error) => {
                console.error("Error reading file:", error);
            };
        } catch (err) {
            console.error("Image upload error:", err);
        }
    };

    return (
        <label className="p-2 text-[#8e8e8e] hover:text-[#ff4d4d] transition-colors cursor-pointer">
            <Camera className="w-6 h-6" />
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
    );
}
