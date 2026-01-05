import * as Ably from 'ably';

let ably: Ably.Realtime | null = null;

export const getAbly = (clientId?: string) => {
    if (ably) return ably;

    if (!clientId) {
        console.warn("[Ably] getAbly called without clientId and no instance exists");
        return null;
    }

    console.log("[Ably] Initializing new Ably instance for client:", clientId);
    ably = new Ably.Realtime({
        authUrl: `/api/ably/auth?clientId=${clientId}`,
        autoConnect: true,
    });

    ably.connection.on('connected', () => {
        console.log("[Ably] Connected to Ably");
    });

    ably.connection.on('failed', () => {
        console.error("[Ably] Connection to Ably failed");
    });

    return ably;
};
