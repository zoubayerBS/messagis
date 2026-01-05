import { useEffect, useCallback, useState, useRef } from 'react';
import { db } from '@/lib/db';
import { getAbly } from '@/lib/ably';
import { getMessages, getRecentChats, getMessageById } from '@/actions/chat';

export function useChatSync(userId: string | undefined, partnerId: string | null = null) {
    const [toastData, setToastData] = useState<{ show: boolean; title: string; body: string; senderId: string }>({
        show: false,
        title: '',
        body: '',
        senderId: ''
    });

    const [isPartnerOnline, setIsPartnerOnline] = useState(false);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [lastMessageId, setLastMessageId] = useState<string | null>(null);

    const partnerIdRef = useRef(partnerId);

    useEffect(() => {
        partnerIdRef.current = partnerId;
    }, [partnerId]);

    const syncMessages = useCallback(async (limit: number = 15, offset: number = 0) => {
        if (!userId || !partnerId) return;
        try {
            const res = await getMessages(userId, partnerId, limit, offset);
            if (res.success && res.messages) {
                const localMsgs = res.messages.map((m: any) => ({
                    ...m,
                    timestamp: m.timestamp && !isNaN(new Date(m.timestamp).getTime()) ? new Date(m.timestamp) : new Date(),
                    reactions: m.reactions || [],
                }));
                await db.messages.bulkPut(localMsgs);
                return res.messages.length;
            }
            return 0;
        } catch (error) {
            console.error('Failed to sync messages:', error);
            return 0;
        }
    }, [userId, partnerId]);

    const syncChats = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await getRecentChats(userId);
            if (res.success && res.chats) {
                const localChats = res.chats.map((c: any) => ({
                    ...c,
                    lastMessageTimestamp: c.lastMessage.timestamp && !isNaN(new Date(c.lastMessage.timestamp).getTime()) ? new Date(c.lastMessage.timestamp) : new Date(),
                    unreadCount: 0,
                }));
                await db.chats.bulkPut(localChats);
            }
        } catch (error) {
            console.error('Failed to sync recent chats:', error);
        }
    }, [userId]);

    // Ably Implementation
    useEffect(() => {
        if (!userId) return;

        const ably = getAbly(userId);
        if (!ably) return;

        // Channel for personal notifications & relay
        const userChannel = ably.channels.get(`user:${userId}`);

        // Channel for GLOBAL PRESENCE (New)
        const globalPresenceChannel = ably.channels.get('global:presence');
        globalPresenceChannel.presence.enter();

        // Channel for current conversation (if any)
        const chatChannelId = partnerId ? [`chat`, userId, partnerId].sort().join(':') : null;
        const chatChannel = chatChannelId ? ably.channels.get(chatChannelId) : null;

        const handleNewMessage = async (msg: any) => {
            let message = msg.data;
            if (!message) return;

            // HANDLE PULL-BASED DELIVERY: Fetch full content if signal only
            if (message.fetchFullContent) {
                console.log('[useChatSync] Pulling full content for message:', message.id);
                try {
                    const res = await getMessageById(message.id);
                    if (res.success && res.message) {
                        message = res.message;
                    } else {
                        console.error('[useChatSync] Failed to pull message content:', res.error);
                        return;
                    }
                } catch (err) {
                    console.error('[useChatSync] Error pulling message:', err);
                    return;
                }
            }

            console.log('[useChatSync] New message received via Ably:', message.id);

            try {
                // Deduplication logic for optimistic messages
                await db.transaction('rw', db.messages, db.chats, async () => {
                    const exists = await db.messages.get(message.id);
                    if (exists) return;

                    if (message.senderId === userId) {
                        const recentLocal = await db.messages
                            .where('senderId').equals(userId)
                            .filter(m => m.id.startsWith('local-') && m.content === message.content && m.receiverId === message.receiverId)
                            .first();
                        if (recentLocal) {
                            await db.messages.delete(recentLocal.id);
                        }
                    }

                    await db.messages.put({
                        ...message,
                        timestamp: new Date(message.timestamp),
                    });

                    // Only update chat preview if it's not a self-message
                    if (message.senderId !== message.receiverId) {
                        const partnerId = message.senderId === userId ? message.receiverId : message.senderId;
                        const existingChat = await db.chats.get(partnerId);

                        await db.chats.put({
                            ...existingChat,
                            partnerId,
                            partnerUsername: message.senderId === userId ? existingChat?.partnerUsername : (message.senderUsername || existingChat?.partnerUsername),
                            partnerEmail: message.senderId === userId ? existingChat?.partnerEmail : (message.senderEmail || existingChat?.partnerEmail),
                            lastMessageContent: message.content,
                            lastMessageTimestamp: new Date(message.timestamp),
                            lastMessageSenderId: message.senderId,
                            lastMessageRead: message.read,
                            lastMessageType: message.type,
                            unreadCount: (message.senderId === userId) ? 0 : ((existingChat?.unreadCount || 0) + 1),
                            isPinned: existingChat?.isPinned || false,
                            isArchived: existingChat?.isArchived || false,
                        });
                    }
                });

                setLastMessageId(message.id);

                if (message.senderId !== userId && message.senderId !== partnerIdRef.current) {
                    const senderDisplay = message.senderUsername ? `@${message.senderUsername}` : (message.senderEmail || 'Nouveau message');
                    setToastData({
                        show: true,
                        title: senderDisplay,
                        body: message.type === 'text' ? (message.content.length > 50 ? message.content.substring(0, 47) + '...' : message.content) : '📷 Image/Audio',
                        senderId: message.senderId
                    });
                }
            } catch (err) {
                console.error('[useChatSync] Ably message sync error:', err);
            }
        };

        const handlePresence = (presenceMsg: any) => {
            if (presenceMsg.clientId === partnerIdRef.current) {
                setIsPartnerOnline(presenceMsg.action === 'enter' || presenceMsg.action === 'present');
            }
        };

        const handleTyping = (msg: any) => {
            if (msg.data.senderId === partnerIdRef.current) {
                setIsPartnerTyping(msg.data.isTyping);
            }
        };

        // Subscriptions
        userChannel.subscribe('new_message', handleNewMessage);
        globalPresenceChannel.presence.subscribe(['enter', 'leave', 'present'], handlePresence);

        // Initial global presence check for partner
        globalPresenceChannel.presence.get().then((members) => {
            if (members) {
                const isOnline = (members as any[]).some(m => m.clientId === partnerIdRef.current);
                setIsPartnerOnline(isOnline);
            }
        });

        if (chatChannel) {
            chatChannel.presence.enter(); // Join presence for the chat (for others to see we are IN the chat)
            chatChannel.subscribe('typing', handleTyping);
        }

        // Initial Sync
        syncChats();

        return () => {
            userChannel.unsubscribe();
            globalPresenceChannel.presence.unsubscribe();
            if (chatChannel) {
                chatChannel.presence.leave();
                chatChannel.unsubscribe();
            }
        };
    }, [userId, partnerId]);

    const sendTyping = (isTyping: boolean) => {
        if (!userId || !partnerId) return;
        const ably = getAbly(userId);
        if (ably) {
            const chatChannelId = [`chat`, userId, partnerId].sort().join(':');
            ably.channels.get(chatChannelId).publish('typing', { senderId: userId, isTyping });
        }
    };

    // REMOVED: Redundant message relay logic
    // sendRealTimeMessage logic removed to avoid duplication

    return {
        syncMessages,
        syncChats,
        toastData,
        closeToast: () => setToastData(prev => ({ ...prev, show: false })),
        isPartnerOnline,
        isPartnerTyping,
        sendTyping,
        lastMessageId
    };
}
