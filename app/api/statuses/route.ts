import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { tasks, projects } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

const VALID_TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
const VALID_PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

type TaskStatus = (typeof VALID_TASK_STATUSES)[number];
type ProjectStatus = (typeof VALID_PROJECT_STATUSES)[number];

function isValidTaskStatus(value: string): value is TaskStatus {
  return (VALID_TASK_STATUSES as readonly string[]).includes(value);
}

function isValidProjectStatus(value: string): value is ProjectStatus {
  return (VALID_PROJECT_STATUSES as readonly string[]).includes(value);
}

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
  const entityType = searchParams.get('entityType') ?? 'task';

  if (entityType === 'project') {
    const projectStatuses = VALID_PROJECT_STATUSES.map((status) => {
      const taskCount = 0;
      return { value: status, label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ') };
    });

    const projectRows = await db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.teamId, teamId))
      .orderBy(desc(projects.createdAt));

    const statusCounts: Record<string, number> = {};
    for (const row of projectRows) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }

    const result = VALID_PROJECT_STATUSES.map((status) => ({
      value: status,
      label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      count: statusCounts[status] ?? 0,
    }));

    return NextResponse.json({ statuses: result, entityType: 'project' });
  }

  const taskRows = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.teamId, teamId))
    .orderBy(desc(tasks.createdAt));

  const statusCounts: Record<string, number> = {};
  for (const row of taskRows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const result = VALID_TASK_STATUSES.map((status) => ({
    value: status,
    label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
    count: statusCounts[status] ?? 0,
  }));

  return NextResponse.json({ statuses: result, entityType: 'task' });
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { entityType, entityId, status } = body as Record<string, unknown>;

  if (typeof status !== 'string' || !status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  if (typeof entityId !== 'number') {
    return NextResponse.json({ error: 'entityId (number) is required' }, { status: 400 });
  }

  const resolvedEntityType = typeof entityType === 'string' ? entityType : 'task';

  if (resolvedEntityType === 'project') {
    if (!isValidProjectStatus(status)) {
      return NextResponse.json(
        { error: `Invalid project status. Valid values: ${VALID_PROJECT_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

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
      .set({ status, updatedAt: new Date() })
      .where(and(eq(projects.id, entityId), eq(projects.teamId, teamId)))
      .returning();

    return NextResponse.json({ project: updated[0] }, { status: 200 });
  }

  if (!isValidTaskStatus(status)) {
    return NextResponse.json(
      { error: `Invalid task status. Valid values: ${VALID_TASK_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

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
    .set({ status, updatedAt: new Date() })
    .where(and(eq(tasks.id, entityId), eq(tasks.teamId, teamId)))
    .returning();

  return NextResponse.json({ task: updated[0] }, { status: 200 });
}