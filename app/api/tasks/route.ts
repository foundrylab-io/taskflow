import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { tasks } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { ensureUserExists } from '@/lib/db/queries';

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
  const projectId = searchParams.get('projectId');

  try {
    const conditions = [eq(tasks.teamId, teamId)];

    if (projectId) {
      const parsed = parseInt(projectId, 10);
      if (!isNaN(parsed)) {
        conditions.push(eq(tasks.projectId, parsed));
      }
    }

    const result = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(100);

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const projectId = typeof data.projectId === 'number' ? data.projectId : parseInt(String(data.projectId), 10);
  if (isNaN(projectId)) {
    return NextResponse.json({ error: 'Valid projectId is required' }, { status: 400 });
  }

  const description = typeof data.description === 'string' ? data.description.trim() : null;
  const status = typeof data.status === 'string' ? data.status : 'todo';
  const priority = typeof data.priority === 'string' ? data.priority : 'medium';
  const deadline = typeof data.deadline === 'string' && data.deadline ? data.deadline : null;

  let assigneeId: number | null = null;
  if (data.assigneeId !== undefined && data.assigneeId !== null) {
    const parsed = typeof data.assigneeId === 'number' ? data.assigneeId : parseInt(String(data.assigneeId), 10);
    if (!isNaN(parsed)) {
      assigneeId = parsed;
    }
  }

  try {
    const [newTask] = await db
      .insert(tasks)
      .values({
        userId: user.id,
        teamId,
        projectId,
        title,
        description,
        status,
        priority,
        deadline,
        assigneeId,
      })
      .returning();

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}