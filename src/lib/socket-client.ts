import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = () => {
    if (!socket) {
        // In Next.js, we might need to point to the server URL explicitly if it's not the same as the window location
        // Or we use a relative path if the custom server handles it.
        socket = io({
            path: '/api/socket',
            addTrailingSlash: false,
        });
    }
    return socket;
};
