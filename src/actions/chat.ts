'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath, unstable_noStore as noStore } from 'next/cache'
import { adminMessaging } from '@/lib/firebase-admin'
import { randomUUID } from 'crypto'

export async function sendMessage(data: {
    content: string
    type: string
    senderId: string
    receiverId: string
    isSelfDestructing?: boolean
    coupleId?: string // Optional, backward compatibility or ignore
}) {
    try {
        // 1. Pre-generate ID and construct message object primarily for Ably emission
        const messageId = randomUUID();
        const now = new Date();

        // This object must match the shape expected by the client and Prisma
        const messagePayload = {
            id: messageId,
            content: data.content,
            type: data.type,
            senderId: data.senderId,
            receiverId: data.receiverId,
            isSelfDestructing: data.isSelfDestructing ?? true,
            read: false,
            timestamp: now,
            isDeleted: false,
            isEdited: false,
            coupleId: data.coupleId || null,
            reactions: [] // Initial empty reactions
        };

        // 2. Persist to Database FIRST to avoid race condition
        const message = await prisma.message.create({
            data: {
                id: messageId,
                content: data.content,
                type: data.type,
                senderId: data.senderId,
                receiverId: data.receiverId,
                isSelfDestructing: data.isSelfDestructing ?? true,
                read: false,
                timestamp: now,
            },
            include: {
                reactions: true
            }
        })

        // 3. Emit Ably Signal AFTER DB
        try {
            if (process.env.ABLY_API_KEY) {
                const Ably = require('ably');
                const ably = new Ably.Rest(process.env.ABLY_API_KEY);

                // Fetch sender details for the signal metadata
                const senderObj = await prisma.user.findUnique({
                    where: { uid: data.senderId },
                    select: { username: true, email: true }
                });

                // OPTIMIZATION: Pull-based delivery for non-text messages
                let transportPayload = {
                    ...messagePayload,
                    senderUsername: senderObj?.username,
                    senderEmail: senderObj?.email
                };
                if (data.type !== 'text') {
                    // Omit content for media to avoid Ably/FCM limits. Client will fetch via getMessageById.
                    transportPayload.content = "";
                    (transportPayload as any).fetchFullContent = true;
                    console.log(`[Ably] Signal only (Pull-based) for media message: ${messageId}`);
                }

                // Publish to recipient's personal channel
                const receiverChannel = ably.channels.get(`user:${data.receiverId}`);
                await receiverChannel.publish('new_message', transportPayload);

                // Publish to sender's personal channel (for other devices)
                const senderChannel = ably.channels.get(`user:${data.senderId}`);
                await senderChannel.publish('new_message', transportPayload);

                console.log("Ably signal sent AFTER DB for message:", messageId);
            } else {
                console.warn("[Action:sendMessage] WARNING: ABLY_API_KEY not found. Real-time update skipped.");
            }
        } catch (ablyError) {
            console.error('Error sending immediate Ably signal:', ablyError);
        }

        // -- Push Notification Logic --
        try {
            const recipient = await prisma.user.findUnique({
                where: { uid: data.receiverId },
                select: { fcmToken: true }
            });

            const sender = await prisma.user.findUnique({
                where: { uid: data.senderId },
                select: { username: true, email: true }
            });

            if (recipient?.fcmToken && adminMessaging) {
                const senderDisplay = sender?.username || sender?.email?.split('@')[0] || "Messagis";
                let notificationBody = 'Nouveau message reçu 👻';
                if (data.type === 'text') {
                    notificationBody = data.content.length > 100 ? data.content.substring(0, 97) + '...' : data.content;
                } else if (data.type === 'image') {
                    notificationBody = '📷 Une photo a été partagée';
                } else if (data.type === 'audio') {
                    notificationBody = '🎵 Message vocal reçu';
                }

                await adminMessaging.send({
                    token: recipient.fcmToken,
                    data: {
                        title: senderDisplay,
                        body: notificationBody,
                        senderId: data.senderId,
                        receiverId: data.receiverId,
                        type: data.type,
                        // Content is omitted for media to avoid 4KB FCM limit. Client will fetch.
                        content: data.type === 'text' ? data.content : "",
                        id: messageId,
                        timestamp: now.toISOString(),
                        click_action: `/chat?uid=${data.senderId}`,
                        tag: `msg-${data.senderId}`
                    },
                    android: { priority: 'high' },
                    apns: {
                        payload: {
                            aps: {
                                'content-available': 1,
                                sound: 'default',
                                threadId: `msg-${data.senderId}`
                            }
                        }
                    }
                });
            }
        } catch (pushError) {
            console.error('Error sending push notification:', pushError);
        }

        revalidatePath('/chat')
        return { success: true, message }
    } catch (error: any) {
        console.error('Error saving message to Prisma:', error)
        return { success: false, error: error.message || String(error) }
    }
}

export async function getMessageById(messageId: string) {
    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: {
                reactions: {
                    include: {
                        user: { select: { uid: true, username: true, email: true } }
                    }
                }
            }
        });
        if (!message) return { success: false, error: "Message not found" };
        return { success: true, message };
    } catch (error: any) {
        console.error('Error fetching message by ID:', error);
        return { success: false, error: error.message || String(error) };
    }
}

export async function getMessages(currentUserId: string, otherUserId: string, limit: number = 15, offset: number = 0) {
    noStore(); // Opt out of static caching
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
                timestamp: 'desc',
            },
            take: limit,
            skip: offset,
            include: {
                reactions: {
                    include: {
                        user: { select: { uid: true, username: true, email: true } }
                    }
                }
            }
        })
        // Reverse to return in chronological order for the client
        return { success: true, messages: messages.reverse() }
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

            if (partnerId && partnerId !== currentUserId && !chatsMap.has(partnerId)) {
                if (archivedIds.includes(partnerId)) return;
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
                content: ""
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
                await prisma.reaction.delete({
                    where: { id: existingReaction.id }
                });
            } else {
                await prisma.reaction.update({
                    where: { id: existingReaction.id },
                    data: { emoji }
                });
            }
        } else {
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
