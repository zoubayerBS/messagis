'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { db } from '@/lib/db';
import { getSocket } from '@/lib/socket-client';
import { getMessages, getRecentChats } from '@/actions/chat';

export function useChatSync(userId: string | undefined, partnerId: string | null = null) {
    const [toastData, setToastData] = useState<{ show: boolean; title: string; body: string; senderId: string }>({
        show: false,
        title: '',
        body: '',
        senderId: ''
    });

    const syncMessages = useCallback(async () => {
        if (!userId || !partnerId) return;

        try {
            const res = await getMessages(userId, partnerId);
            if (res.success && res.messages) {
                // Bulk update local DB
                const localMsgs = res.messages.map((m: any) => ({
                    id: m.id,
                    senderId: m.senderId,
                    receiverId: m.receiverId,
                    content: m.content,
                    type: m.type as any,
                    timestamp: m.timestamp && !isNaN(new Date(m.timestamp).getTime()) ? new Date(m.timestamp) : new Date(),
                    read: m.read,
                    isSelfDestructing: m.isSelfDestructing,
                    isDeleted: m.isDeleted,
                    isEdited: m.isEdited,
                    reactions: m.reactions || [],
                }));

                await db.messages.bulkPut(localMsgs);
                console.log(`Synced ${localMsgs.length} messages for chat ${partnerId}`);
            }
        } catch (error) {
            console.error('Failed to sync messages:', error);
        }
    }, [userId, partnerId]);

    const syncChats = useCallback(async () => {
        if (!userId) return;
        try {
            const res = await getRecentChats(userId);
            if (res.success && res.chats) {
                const localChats = res.chats.map((c: any) => ({
                    partnerId: c.partnerId,
                    partnerUsername: c.partnerUsername,
                    partnerEmail: c.partnerEmail,
                    lastMessageContent: c.lastMessage.content,
                    lastMessageTimestamp: c.lastMessage.timestamp && !isNaN(new Date(c.lastMessage.timestamp).getTime()) ? new Date(c.lastMessage.timestamp) : new Date(),
                    lastMessageSenderId: c.lastMessage.senderId,
                    lastMessageRead: c.lastMessage.read,
                    lastMessageType: c.lastMessage.type,
                    unreadCount: 0, // Simplified for now
                    isPinned: c.isPinned,
                    isArchived: false,
                }));
                await db.chats.bulkPut(localChats);
                console.log(`Synced ${localChats.length} recent chats`);
            }
        } catch (error) {
            console.error('Failed to sync recent chats:', error);
        }
    }, [userId]);

    // Use refs for stable access in socket callbacks without triggering effect re-runs
    const partnerIdRef = useRef(partnerId);

    useEffect(() => {
        partnerIdRef.current = partnerId;
    }, [partnerId]);

    useEffect(() => {
        if (!userId) return;

        const socket = getSocket();

        // Trigger explicit socket initialization API route
        fetch('/api/socket');

        const joinRoom = () => {
            console.log('[useChatSync] Joining room:', userId);
            socket.emit('join', userId);
        };

        const handleConnect = () => {
            console.log('[useChatSync] Socket connected, joining room...');
            joinRoom();
            // Re-sync messages on connection to catch up
            if (partnerIdRef.current) syncMessages();
            syncChats();
        };

        const handleReconnect = (attempt: number) => {
            console.log('[useChatSync] Socket reconnected after attempt:', attempt);
            joinRoom();
            if (partnerIdRef.current) syncMessages();
            syncChats();
        };

        const handleNewMessage = async (message: any) => {
            console.log('[useChatSync] New message received via socket:', message);

            // 1. Deduplication Logic
            await db.transaction('rw', db.messages, async () => {
                // Check if this specific message ID already exists (Update case)
                const existingReal = await db.messages.get(message.id);
                if (existingReal) {
                    await db.messages.put({
                        ...message,
                        timestamp: message.timestamp && !isNaN(new Date(message.timestamp).getTime()) ? new Date(message.timestamp) : new Date(),
                    });
                    return;
                }

                // If sent by me, check for any "local-" message with same content/recipient
                // that was created recently (within last 10 seconds)
                if (message.senderId === userId) {
                    const recentLocal = await db.messages
                        .where('senderId').equals(userId)
                        .filter(m =>
                            m.id.startsWith('local-') &&
                            m.content === message.content &&
                            m.receiverId === message.receiverId &&
                            Math.abs(new Date().getTime() - new Date(m.timestamp).getTime()) < 10000
                        )
                        .first();

                    if (recentLocal) {
                        console.log('[useChatSync] Replaced optimistic message:', recentLocal.id, 'with real:', message.id);
                        await db.messages.delete(recentLocal.id);
                    }
                }

                await db.messages.put({
                    ...message,
                    timestamp: message.timestamp && !isNaN(new Date(message.timestamp).getTime()) ? new Date(message.timestamp) : new Date(),
                });
            });

            // 2. Update chat preview in Dexie
            await db.chats.put({
                partnerId: message.senderId === userId ? message.receiverId : message.senderId,
                lastMessageContent: message.content,
                lastMessageTimestamp: message.timestamp && !isNaN(new Date(message.timestamp).getTime()) ? new Date(message.timestamp) : new Date(),
                lastMessageSenderId: message.senderId,
                lastMessageRead: message.read,
                lastMessageType: message.type,
                unreadCount: message.senderId === userId ? 0 : 1, // Only increment if message is from partner
                isPinned: false,
                isArchived: false,
            });

            // 3. Show Foreground Toast only if:
            // - We are NOT currently looking at this chat (partnerIdRef.current !== senderId)
            // - The message was not sent by us
            if (message.senderId !== userId && message.senderId !== partnerIdRef.current) {
                const notificationBody = message.type === 'text'
                    ? (message.content.length > 50 ? message.content.substring(0, 47) + '...' : message.content)
                    : (message.type === 'image' ? '📷 Photo' : '🎵 Vocal');

                setToastData({
                    show: true,
                    title: 'Nouveau message',
                    body: notificationBody,
                    senderId: message.senderId
                });

                // Auto-hide after 5 seconds
                setTimeout(() => {
                    setToastData(prev => ({ ...prev, show: false }));
                }, 5000);
            }
        };

        // If socket is already connected when this effect mounts, ensure we join
        if (socket.connected) {
            joinRoom();
        }

        socket.on('connect', handleConnect);
        socket.on('reconnect', handleReconnect);
        socket.on('new_message', handleNewMessage);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('reconnect', handleReconnect);
            socket.off('new_message', handleNewMessage);
        };
    }, [userId]); // Removed partnerId, syncChats, syncMessages from dependencies

    return {
        syncMessages,
        syncChats,
        toastData,
        closeToast: () => setToastData(prev => ({ ...prev, show: false }))
    };
}
