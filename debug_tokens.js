const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    try {
        const users = await prisma.user.findMany({
            where: { fcmToken: { not: null } },
            select: { email: true, fcmToken: true, username: true }
        });
        console.log('=== USERS WITH FCM TOKENS ===');
        console.log('Total:', users.length);
        users.forEach(u => {
            console.log(`- User: ${u.username || u.email}`);
            console.log(`  Token: ${u.fcmToken.substring(0, 20)}...`);
        });
        console.log('=============================');
    } catch (e) {
        console.error('Error fetching tokens:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
