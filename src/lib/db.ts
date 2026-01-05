import Dexie, { type Table } from 'dexie';

export interface LocalMessage {
    id: string;
    senderId: string;
    receiverId: string;
    content: string;
    type: 'text' | 'image' | 'audio';
    timestamp: Date;
    read: boolean;
    isSelfDestructing: boolean;
    isDeleted: boolean;
    isEdited: boolean;
    reactions: any[];
}

export interface LocalChat {
    partnerId: string;
    partnerUsername?: string;
    partnerEmail?: string;
    lastMessageContent: string;
    lastMessageTimestamp: Date;
    lastMessageSenderId: string;
    lastMessageRead: boolean;
    lastMessageType: string;
    unreadCount: number;
    isPinned: boolean;
    isArchived: boolean;
}

export class MessagisDB extends Dexie {
    messages!: Table<LocalMessage>;
    chats!: Table<LocalChat>;

    constructor() {
        super('MessagisDB');
        this.version(1).stores({
            messages: 'id, senderId, receiverId, timestamp, [senderId+receiverId]',
            chats: 'partnerId, lastMessageTimestamp, isPinned, isArchived'
        });
    }
}

export const db = new MessagisDB();
