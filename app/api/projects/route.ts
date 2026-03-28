import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const allProjects = await db
    .select()
    .from(projects)
    .where(
      status
        ? eq(projects.teamId, teamId) && eq(projects.status, status)
        : eq(projects.teamId, teamId)
    )
    .orderBy(desc(projects.createdAt))
    .limit(100);

  return NextResponse.json(allProjects);
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, description, status, deadline, userId } = body as {
    name?: unknown;
    description?: unknown;
    status?: unknown;
    deadline?: unknown;
    userId?: unknown;
  };

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!userId || typeof userId !== 'number') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const [newProject] = await db
    .insert(projects)
    .values({
      userId,
      teamId,
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : null,
      status: typeof status === 'string' ? status : 'active',
      deadline: typeof deadline === 'string' ? deadline : null,
    })
    .returning();

  return NextResponse.json(newProject, { status: 201 });
}