import { prisma } from '../db.js';
import { hashPassword } from '../auth/passwords.js';
import { generateToken } from '../auth/tokens.js';
import { logger } from '../logger.js';

// Create an initial admin if there are no users yet, plus one open
// invitation for testing the signup flow.
async function seed(): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD || 'changeme1234';
    const passwordHash = await hashPassword(password);
    const admin = await prisma.user.create({
      data: { email, passwordHash, isAdmin: true, emailVerifiedAt: new Date() },
    });
    const inv = await prisma.invitation.create({
      data: { code: generateToken(16), createdById: admin.id },
    });
    logger.info({ email, password, invitation: inv.code }, 'seeded initial admin + invitation');
  } else {
    logger.info('users already exist; skipping seed');
  }
  await prisma.$disconnect();
}

seed().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
