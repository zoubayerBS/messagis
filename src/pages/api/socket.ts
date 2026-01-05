import { Server as NetServer } from 'http';
import { NextApiRequest } from 'next';
import { Server as ServerIO } from 'socket.io';
import { NextApiResponseServerIO } from '@/types/next';
import { setIO } from '@/lib/socket-io';

export const config = {
    api: {
        bodyParser: false,
    },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
    if (!res.socket.server.io) {
        console.log('*First use, starting socket.io');

        const httpServer: NetServer = res.socket.server as any;
        const io = new ServerIO(httpServer, {
            path: '/api/socket',
            addTrailingSlash: false,
        });

        io.on('connection', (socket) => {
            console.log('Socket connected:', socket.id);
            let currentUserId: string | null = null;

            socket.on('join', (userId: string) => {
                currentUserId = userId;
                socket.join(userId);
                console.log(`User ${userId} joined room`);

                // Broadcast online status to everyone (or specific friends/rooms if optimized)
                // For simplicity/direct messages, we can just broadcast generally or let clients query
                // Actually, a better approach for 1-on-1 is to emit to the user's partners, 
                // but since we don't track partners here easily, we rely on the partner listening 
                // to specific events or just broadcast "user_online" to a global room if scalability allows,
                // OR we let the client "subscribe" to a partner's status.
                // SIMPLIFIED APPROACH: Users join a "global_presence" room? No, privacy.
                // PRO APPROACH: When A opens chat with B, A joins "status_B".
                // Let's stick to: When A joins, if B sends "ping_status" to A, A responds.
                // EASIER: Just broadcast to all connected clients is easiest for small scale, 
                // but for production, we rely on specific event: 'user_connected'.

                socket.broadcast.emit('user_status', { userId, isOnline: true });
            });

            socket.on('typing', (data: { receiverId: string }) => {
                if (currentUserId && data.receiverId) {
                    io.to(data.receiverId).emit('typing', { senderId: currentUserId });
                }
            });

            socket.on('stop_typing', (data: { receiverId: string }) => {
                if (currentUserId && data.receiverId) {
                    io.to(data.receiverId).emit('stop_typing', { senderId: currentUserId });
                }
            });

            socket.on('disconnect', () => {
                console.log('Socket disconnected:', socket.id);
                if (currentUserId) {
                    socket.broadcast.emit('user_status', { userId: currentUserId, isOnline: false });
                }
            });
        });

        res.socket.server.io = io;
        setIO(io);
    } else {
        console.log('socket.io already running');
    }
    res.end();
};

export default ioHandler;
