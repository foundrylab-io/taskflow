import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { tasks } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

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
  const projectIdParam = searchParams.get('projectId');

  try {
    const conditions = [eq(tasks.teamId, teamId)];

    if (projectIdParam) {
      const projectId = parseInt(projectIdParam, 10);
      if (!isNaN(projectId)) {
        conditions.push(eq(tasks.projectId, projectId));
      }
    }

    const assignments = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(100);

    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/assignments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

  let body: {
    taskId?: unknown;
    assigneeId?: unknown;
    projectId?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    priority?: unknown;
    deadline?: unknown;
    userId?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const taskId = typeof body.taskId === 'number' ? body.taskId : undefined;
  const assigneeId = typeof body.assigneeId === 'number' ? body.assigneeId : null;
  const projectId = typeof body.projectId === 'number' ? body.projectId : undefined;
  const title = typeof body.title === 'string' ? body.title.trim() : undefined;
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const status = typeof body.status === 'string' ? body.status : 'todo';
  const priority = typeof body.priority === 'string' ? body.priority : 'medium';
  const deadline = typeof body.deadline === 'string' ? body.deadline : null;
  const userId = typeof body.userId === 'number' ? body.userId : undefined;

  // If taskId is provided, update the assignee on an existing task
  if (taskId !== undefined) {
    try {
      const updated = await db
        .update(tasks)
        .set({
          assigneeId,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.teamId, teamId)))
        .returning();

      if (updated.length === 0) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json(updated[0], { status: 200 });
    } catch (error) {
      console.error('POST /api/assignments (update assignee) error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // Otherwise create a new task with an assignee
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  if (projectId === undefined) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  if (userId === undefined) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const inserted = await db
      .insert(tasks)
      .values({
        userId,
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

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/assignments (create task) error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}