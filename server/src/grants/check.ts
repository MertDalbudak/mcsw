import { prisma } from '../db.js';

export type GrantCapability =
  | 'observe' // any read access — implied by every other capability
  | 'start'
  | 'stop'
  | 'restart'
  | 'command'
  | 'moderate'
  | 'admin'
  | 'invite';

export async function hasGrant(
  userId: string,
  mcsmInstanceId: string,
  serverId: string,
  cap: GrantCapability,
): Promise<boolean> {
  const grant = await prisma.serverGrant.findUnique({
    where: { userId_mcsmInstanceId_serverId: { userId, mcsmInstanceId, serverId } },
  });
  if (!grant) return false;
  switch (cap) {
    case 'observe':  return true; // any grant row implies observe
    case 'start':    return grant.canStart;
    case 'stop':     return grant.canStop;
    case 'restart':  return grant.canRestart;
    case 'command':  return grant.canCommand;
    case 'moderate': return grant.canModerate;
    case 'admin':    return grant.canAdmin;
    case 'invite':   return grant.canInvite;
  }
}

export async function listAccessibleServers(userId: string): Promise<
  Array<{ mcsmInstanceId: string; serverId: string }>
> {
  const grants = await prisma.serverGrant.findMany({
    where: { userId },
    select: { mcsmInstanceId: true, serverId: true },
  });
  return grants;
}
