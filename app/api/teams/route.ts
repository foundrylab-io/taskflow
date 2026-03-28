import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { getTeamIdByClerkId, ensureUserExists } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .orderBy(desc(teams.createdAt))
    .limit(100);

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await ensureUserExists(clerkId);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name } = body as Record<string, unknown>;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
  }

  const [newTeam] = await db
    .insert(teams)
    .values({
      name: trimmedName,
    })
    .returning();

  if (!newTeam) {
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }

  await db.insert(teamMembers).values({
    userId: user.id,
    teamId: newTeam.id,
    role: 'owner',
  });

  return NextResponse.json(newTeam, { status: 201 });
}