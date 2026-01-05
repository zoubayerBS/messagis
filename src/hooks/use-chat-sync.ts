'use client';

import { useEffect, useCallback, useState } from 'react';
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

    useEffect(() => {
        if (!userId) return;

        const socket = getSocket();

        // Trigger explicit socket initialization API route
        fetch('/api/socket');

        socket.on('connect', () => {
            console.log('Socket connected, joining room:', userId);
            socket.emit('join', userId);
        });

        socket.on('new_message', async (message: any) => {
            console.log('New message received via socket:', message);

            // 1. Save to local messages
            await db.messages.put({
                ...message,
                timestamp: message.timestamp && !isNaN(new Date(message.timestamp).getTime()) ? new Date(message.timestamp) : new Date(),
            });

            // 2. Update chat preview in Dexie
            await db.chats.put({
                partnerId: message.senderId === userId ? message.receiverId : message.senderId,
                lastMessageContent: message.content,
                lastMessageTimestamp: message.timestamp && !isNaN(new Date(message.timestamp).getTime()) ? new Date(message.timestamp) : new Date(),
                lastMessageSenderId: message.senderId,
                lastMessageRead: message.read,
                lastMessageType: message.type,
                unreadCount: message.senderId === userId ? 0 : 1,
                isPinned: false,
                isArchived: false,
            });

            // 3. Show Foreground Toast if not in this chat
            if (message.senderId !== userId && message.senderId !== partnerId) {
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
        });

        return () => {
            socket.off('new_message');
            socket.off('connect');
        };
    }, [userId, partnerId]);

    // Initial sync
    useEffect(() => {
        if (userId) {
            syncChats();
            if (partnerId) {
                syncMessages();
            }
        }
    }, [userId, partnerId, syncMessages, syncChats]);

    return {
        syncMessages,
        syncChats,
        toastData,
        closeToast: () => setToastData(prev => ({ ...prev, show: false }))
    };
}
