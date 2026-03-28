import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { tasks, projects } from '@/lib/db/schema';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
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
  const type = searchParams.get('type'); // 'tasks' | 'projects' | null (all)

  try {
    const results: {
      id: number;
      type: 'task' | 'project';
      title: string;
      deadline: string;
      status: string;
      priority?: string;
      projectId?: number;
      createdAt: Date;
    }[] = [];

    if (!type || type === 'tasks') {
      const taskDeadlines = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          deadline: tasks.deadline,
          status: tasks.status,
          priority: tasks.priority,
          projectId: tasks.projectId,
          createdAt: tasks.createdAt,
        })
        .from(tasks)
        .where(and(eq(tasks.teamId, teamId), isNotNull(tasks.deadline)))
        .orderBy(desc(tasks.createdAt))
        .limit(100);

      for (const task of taskDeadlines) {
        if (task.deadline) {
          results.push({
            id: task.id,
            type: 'task',
            title: task.title,
            deadline: task.deadline,
            status: task.status,
            priority: task.priority,
            projectId: task.projectId,
            createdAt: task.createdAt,
          });
        }
      }
    }

    if (!type || type === 'projects') {
      const projectDeadlines = await db
        .select({
          id: projects.id,
          name: projects.name,
          deadline: projects.deadline,
          status: projects.status,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(and(eq(projects.teamId, teamId), isNotNull(projects.deadline)))
        .orderBy(desc(projects.createdAt))
        .limit(100);

      for (const project of projectDeadlines) {
        if (project.deadline) {
          results.push({
            id: project.id,
            type: 'project',
            title: project.name,
            deadline: project.deadline,
            status: project.status,
            createdAt: project.createdAt,
          });
        }
      }
    }

    results.sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/deadlines error:', error);
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

  try {
    const body = await request.json();
    const { entityType, entityId, deadline } = body as {
      entityType: 'task' | 'project';
      entityId: number;
      deadline: string;
    };

    if (!entityType || !entityId || !deadline) {
      return NextResponse.json(
        { error: 'entityType, entityId, and deadline are required' },
        { status: 400 }
      );
    }

    if (entityType !== 'task' && entityType !== 'project') {
      return NextResponse.json(
        { error: 'entityType must be "task" or "project"' },
        { status: 400 }
      );
    }

    if (entityType === 'task') {
      const existing = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, entityId), eq(tasks.teamId, teamId)))
        .limit(1);

      if (existing.length === 0) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const updated = await db
        .update(tasks)
        .set({ deadline, updatedAt: new Date() })
        .where(and(eq(tasks.id, entityId), eq(tasks.teamId, teamId)))
        .returning();

      return NextResponse.json({ type: 'task', record: updated[0] }, { status: 200 });
    }

    if (entityType === 'project') {
      const existing = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, entityId), eq(projects.teamId, teamId)))
        .limit(1);

      if (existing.length === 0) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const updated = await db
        .update(projects)
        .set({ deadline, updatedAt: new Date() })
        .where(and(eq(projects.id, entityId), eq(projects.teamId, teamId)))
        .returning();

      return NextResponse.json({ type: 'project', record: updated[0] }, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/deadlines error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}