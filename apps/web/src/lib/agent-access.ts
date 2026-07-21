import { agentMembers, agents, getDb, type Agent } from "@clever/core/db";
import { and, eq } from "drizzle-orm";
import { requireUser, type SessionUser } from "@/lib/auth";

export type AgentRole = "owner" | "admin" | "member";

export type AgentAccess = {
  agent: Agent;
  user: SessionUser;
  role: AgentRole;
};

/**
 * Resolves the current user's access to an agent: owner, platform admin, or a
 * user explicitly invited to this agent. Returns null when there is no access.
 */
export async function getAgentAccess(
  agentId: string,
): Promise<AgentAccess | null> {
  const user = await requireUser();
  const db = getDb();

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) return null;

  if (agent.ownerId === user.id) return { agent, user, role: "owner" };
  if (user.role === "admin") return { agent, user, role: "admin" };

  const [membership] = await db
    .select({ id: agentMembers.id })
    .from(agentMembers)
    .where(
      and(
        eq(agentMembers.agentId, agentId),
        eq(agentMembers.userId, user.id),
      ),
    )
    .limit(1);

  return membership ? { agent, user, role: "member" } : null;
}

/** Invited members can edit, but not delete the agent or manage its people. */
export function canManageAgent(role: AgentRole): boolean {
  return role === "owner" || role === "admin";
}
