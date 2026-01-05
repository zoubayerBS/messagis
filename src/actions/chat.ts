'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath, unstable_noStore as noStore } from 'next/cache'
import { adminMessaging, adminDb } from '@/lib/firebase-admin'
import { getIO } from '@/lib/socket-io'

export async function sendMessage(data: {
    content: string
    type: string
    senderId: string
    receiverId: string
    isSelfDestructing?: boolean
    coupleId?: string // Optional, backward compatibility or ignore
}) {
    try {
        const message = await prisma.message.create({
            data: {
                content: data.content,
                type: data.type,
                senderId: data.senderId,
                receiverId: data.receiverId,
                isSelfDestructing: data.isSelfDestructing ?? true,
                read: false,
                // We leave coupleId null or optionnal
            },
        })

        // -- Real-Time Signaling --
        try {
            if (adminDb) {
                const chatId = [data.senderId, data.receiverId].sort().join('_');
                const now = new Date().toISOString();

                // Signal for the specific chat
                await adminDb.collection('chatSignals').doc(chatId).set({
                    lastMessageAt: now,
                    lastSenderId: data.senderId
                }, { merge: true });

                // Signal for the receivers chat list
                await adminDb.collection('userSignals').doc(data.receiverId).set({
                    lastUpdateAt: now
                }, { merge: true });

                // Signal for the senders chat list (to update own status/preview)
                await adminDb.collection('userSignals').doc(data.senderId).set({
                    lastUpdateAt: now
                }, { merge: true });

                console.log("Real-time signals sent via Firestore");
            }
        } catch (signalError) {
            console.error('Error sending real-time signals:', signalError);
        }

        // -- Push Notification Logic --
        try {
            console.log("Push Notification Logic started for recipient:", data.receiverId);
            const recipient = await prisma.user.findUnique({
                where: { uid: data.receiverId },
                select: { fcmToken: true }
            });

            const sender = await prisma.user.findUnique({
                where: { uid: data.senderId },
                select: { username: true, email: true }
            });

            console.log("Recipient token found:", recipient?.fcmToken ? "Yes" : "No");

            if (recipient?.fcmToken && adminMessaging) {
                const senderDisplay = sender?.username || sender?.email?.split('@')[0] || "Messagis";
                console.log("Sending push notification via adminMessaging...");

                let notificationBody = 'Nouveau message reçu 👻';
                if (data.type === 'text') {
                    notificationBody = data.content.length > 100 ? data.content.substring(0, 97) + '...' : data.content;
                } else if (data.type === 'image') {
                    notificationBody = '📷 Une photo a été partagée';
                } else if (data.type === 'audio') {
                    notificationBody = '🎵 Message vocal reçu';
                }

                const response = await adminMessaging.send({
                    token: recipient.fcmToken,
                    notification: {
                        title: senderDisplay,
                        body: notificationBody,
                    },
                    data: {
                        senderId: data.senderId,
                        type: data.type,
                        click_action: `/chat?uid=${data.senderId}`,
                        tag: `msg-${data.senderId}` // Group notifications by sender
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            tag: `msg-${data.senderId}`
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                threadId: `msg-${data.senderId}` // Support threading on iOS
                            }
                        }
                    }
                });
                console.log("Push notification response:", response);
            } else {
                console.log("Skipping push: recipient token missing or adminMessaging not initialized.");
            }
        } catch (pushError) {
            console.error('Error sending push notification:', pushError);
            // Don't fail the message if push fails
        }

        // -- Socket.io Signaling --
        try {
            const io = getIO();
            if (io) {
                io.to(data.receiverId).emit('new_message', message);
                io.to(data.senderId).emit('new_message', message);
                console.log("Socket.io signal sent for message:", message.id);
            }
        } catch (socketError) {
            console.error('Error sending socket signal:', socketError);
        }

        revalidatePath('/chat')
        return { success: true, message }
    } catch (error: any) {
        console.error('Error saving message to Prisma:', error)
        return { success: false, error: error.message || String(error) }
    }
}

export async function getMessages(currentUserId: string, otherUserId: string) {
    noStore(); // Opt out of static caching for real-time polling
    try {
        const settings = await prisma.chatSettings.findUnique({
            where: { userId_partnerId: { userId: currentUserId, partnerId: otherUserId } }
        });

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: otherUserId },
                    { senderId: otherUserId, receiverId: currentUserId }
                ],
                timestamp: settings?.lastCleared ? { gt: settings.lastCleared } : undefined
            },
            orderBy: {
                timestamp: 'asc',
            },
            take: 100, // Limit initial load
            include: {
                reactions: {
                    include: {
                        user: { select: { uid: true, username: true, email: true } }
                    }
                }
            }
        })
        return { success: true, messages }
    } catch (error: any) {
        console.error('Error fetching messages from Prisma:', error)
        return { success: false, error: error.message || String(error) }
    }
}

export async function getRecentChats(currentUserId: string) {
    noStore();
    try {
        const settingsList = await prisma.chatSettings.findMany({
            where: { userId: currentUserId }
        });

        const archivedIds = settingsList.filter((s: any) => s.isArchived).map((s: any) => s.partnerId);
        const pinnedIds = settingsList.filter((s: any) => s.isPinned).map((s: any) => s.partnerId);

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId },
                    { receiverId: currentUserId }
                ]
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 500,
            include: {
                sender: { select: { uid: true, email: true, username: true } },
                receiver: { select: { uid: true, email: true, username: true } }
            }
        });

        const chatsMap = new Map();

        messages.forEach((msg: any) => {
            const isMe = msg.senderId === currentUserId;
            const partnerId = isMe ? msg.receiverId : msg.senderId;
            const partner = isMe ? msg.receiver : msg.sender;

            if (partnerId && !chatsMap.has(partnerId)) {
                // Filter out archived if they don't have new messages? 
                // Plan: Hide archived by default in the main list.
                if (archivedIds.includes(partnerId)) return;

                // Respect lastCleared for the last message display?
                // For simplicity, just check if msg is older than cleared.
                const s = settingsList.find((c: any) => c.partnerId === partnerId);
                if (s?.lastCleared && msg.timestamp <= s.lastCleared) return;

                chatsMap.set(partnerId, {
                    partnerId: partnerId,
                    partnerEmail: partner?.email,
                    partnerUsername: partner?.username,
                    isPinned: pinnedIds.includes(partnerId),
                    lastMessage: {
                        content: msg.content,
                        type: msg.type,
                        timestamp: msg.timestamp,
                        read: msg.read,
                        senderId: msg.senderId
                    }
                });
            }
        });

        const chats = Array.from(chatsMap.values())
            .sort((a: any, b: any) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return b.lastMessage.timestamp - a.lastMessage.timestamp;
            });

        return { success: true, chats };
    } catch (error: any) {
        console.error('Error fetching recent chats:', error);
        return { success: false, error: error.message || String(error) };
    }
}

export async function markMessageAsRead(messageId: string) {
    try {
        await prisma.message.update({
            where: { id: messageId },
            data: { read: true }
        })
        return { success: true }
    } catch (error) {
        console.error('Error marking message as read in Prisma:', error)
        return { success: false, error }
    }
}

export async function markConversationAsRead(userId: string, senderId: string) {
    try {
        await prisma.message.updateMany({
            where: {
                receiverId: userId,
                senderId: senderId,
                read: false
            },
            data: { read: true }
        });
        revalidatePath('/chat');
        revalidatePath('/chat-list');
        return { success: true };
    } catch (error) {
        console.error('Error marking conversation as read:', error);
        return { success: false, error };
    }
}

export async function getChatSettings(userId: string, partnerId: string) {
    try {
        let settings = await prisma.chatSettings.findUnique({
            where: { userId_partnerId: { userId, partnerId } }
        });
        if (!settings) {
            settings = await prisma.chatSettings.create({
                data: { userId, partnerId }
            });
        }
        return { success: true, settings };
    } catch (error) {
        return { success: false, error };
    }
}

export async function toggleArchive(userId: string, partnerId: string) {
    try {
        const settings = await prisma.chatSettings.findUnique({
            where: { userId_partnerId: { userId, partnerId } }
        });
        await prisma.chatSettings.upsert({
            where: { userId_partnerId: { userId, partnerId } },
            create: { userId, partnerId, isArchived: true },
            update: { isArchived: !settings?.isArchived }
        });
        revalidatePath('/chat-list');
        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

export async function togglePin(userId: string, partnerId: string) {
    try {
        const settings = await prisma.chatSettings.findUnique({
            where: { userId_partnerId: { userId, partnerId } }
        });
        await prisma.chatSettings.upsert({
            where: { userId_partnerId: { userId, partnerId } },
            create: { userId, partnerId, isPinned: true },
            update: { isPinned: !settings?.isPinned }
        });
        revalidatePath('/chat-list');
        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

export async function clearConversation(userId: string, partnerId: string) {
    try {
        await prisma.chatSettings.upsert({
            where: { userId_partnerId: { userId, partnerId } },
            create: { userId, partnerId, lastCleared: new Date() },
            update: { lastCleared: new Date() }
        });
        revalidatePath('/chat');
        revalidatePath('/chat-list');
        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

export async function deleteMessage(messageId: string, userId: string) {
    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) return { success: false, error: "Message introuvable" };
        if (message.senderId !== userId) return { success: false, error: "Non autorisé" };

        await prisma.message.update({
            where: { id: messageId },
            data: {
                isDeleted: true,
                content: "" // Clear content for privacy
            }
        });
        revalidatePath('/chat');
        return { success: true };
    } catch (error) {
        console.error('Error deleting message:', error);
        return { success: false, error: "Erreur serveur" };
    }
}

export async function editMessage(messageId: string, newContent: string, userId: string) {
    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) return { success: false, error: "Message introuvable" };
        if (message.senderId !== userId) return { success: false, error: "Non autorisé" };
        if (message.read) return { success: false, error: "Impossible de modifier un message lu" };

        await prisma.message.update({
            where: { id: messageId },
            data: {
                content: newContent,
                isEdited: true
            }
        });
        revalidatePath('/chat');
        return { success: true };
    } catch (error) {
        console.error('Error editing message:', error);
        return { success: false, error: "Erreur serveur" };
    }
}

export async function toggleReaction(messageId: string, emoji: string, userId: string) {
    try {
        const existingReaction = await prisma.reaction.findUnique({
            where: {
                userId_messageId: {
                    userId,
                    messageId
                }
            }
        });

        if (existingReaction) {
            if (existingReaction.emoji === emoji) {
                // Remove if same emoji
                await prisma.reaction.delete({
                    where: { id: existingReaction.id }
                });
            } else {
                // Update if different emoji
                await prisma.reaction.update({
                    where: { id: existingReaction.id },
                    data: { emoji }
                });
            }
        } else {
            // Create new
            await prisma.reaction.create({
                data: {
                    userId,
                    messageId,
                    emoji
                }
            });
        }
        revalidatePath('/chat');
        return { success: true };
    } catch (error) {
        console.error('Error toggling reaction:', error);
        return { success: false, error: "Erreur serveur" };
    }
}
