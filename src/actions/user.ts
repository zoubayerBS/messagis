'use server'

import { prisma } from '@/lib/prisma'

export async function syncUserAndCouple(data: {
    uid: string
    email: string
    username?: string | null
    coupleId?: string | null
}) {
    try {
        // 0. Check username uniqueness if provided
        if (data.username) {
            const existing = await prisma.user.findUnique({
                where: { username: data.username }
            });
            if (existing && existing.uid !== data.uid) {
                return { success: false, error: "Ce pseudo est déjà utilisé par un autre utilisateur." };
            }
        }

        // 1. If coupleId exists, ensure Couple exists
        if (data.coupleId) {
            await prisma.couple.upsert({
                where: { id: data.coupleId },
                update: {},
                create: {
                    id: data.coupleId,
                },
            })
        }

        // 2. Upsert User
        if (!data.email) {
            console.error("Sync User: Email is missing for UID:", data.uid);
            return { success: false, error: "Email is required" };
        }

        const user = await prisma.user.upsert({
            where: { uid: data.uid },
            update: {
                email: data.email,
                coupleId: data.coupleId,
                username: data.username || undefined,
            },
            create: {
                uid: data.uid,
                email: data.email,
                coupleId: data.coupleId,
                username: data.username || null,
            },
        })

        return { success: true, user }
    } catch (error) {
        console.error('Error syncing user/couple to Prisma:', error)
        return { success: false, error }
    }
}

export async function searchUsers(query: string) {
    try {
        if (!query || query.length < 3) return { success: true, users: [] };

        const users = await prisma.user.findMany({
            where: {
                OR: [
                    {
                        email: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    },
                    {
                        username: {
                            contains: query,
                            mode: 'insensitive',
                        },
                    }
                ]
            },
            select: {
                uid: true,
                email: true,
                username: true,
            },
            take: 5,
        });

        return { success: true, users };
    } catch (error) {
        console.error('Error searching users:', error);
        return { success: false, error };
    }
}

export async function getUserProfile(uid: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { uid },
            select: {
                email: true,
                username: true,
                uid: true
            }
        });
        return { success: true, user };
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return { success: false, error };
    }
}

export async function updateUsername(uid: string, username: string) {
    try {
        // Basic validation
        if (!username || username.length < 3) {
            return { success: false, error: "Le nom d'utilisateur doit faire au moins 3 caractères." };
        }

        // Check uniqueness
        const existing = await prisma.user.findUnique({
            where: { username }
        });

        if (existing && existing.uid !== uid) {
            return { success: false, error: "Ce nom d'utilisateur est déjà pris." };
        }

        await prisma.user.update({
            where: { uid },
            data: { username }
        });

        return { success: true };
    } catch (error) {
        console.error('Error updating username:', error);
        return { success: false, error: "Une erreur est survenue." };
    }
}

export async function updateFcmToken(uid: string, token: string | null) {
    try {
        await prisma.user.update({
            where: { uid },
            data: { fcmToken: token }
        });
        return { success: true };
    } catch (error) {
        console.error('Error updating FCM token:', error);
        return { success: false, error: "Erreur lors de la mise à jour des notifications." };
    }
}
