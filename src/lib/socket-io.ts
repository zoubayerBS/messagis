import { Server as ServerIO } from 'socket.io';

declare global {
    var io: ServerIO | undefined;
}

export const getIO = () => {
    return global.io;
};

export const setIO = (ioInstance: ServerIO) => {
    global.io = ioInstance;
};
