import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { tasks, projects } from '@/lib/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { revalidatePath } from 'next/cache';

type DeadlineItem = {
  id: number;
  type: 'task' | 'project';
  title: string;
  deadline: string;
  status: string;
  priority?: string;
  projectId?: number;
};

function getDaysUntil(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadlineBadge(deadline: string, status: string): {
  label: string;
  className: string;
} {
  if (status === 'done' || status === 'completed') {
    return { label: 'Completed', className: 'bg-green-100 text-green-700' };
  }
  const days = getDaysUntil(deadline);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, className: 'bg-red-100 text-red-700' };
  if (days === 0) return { label: 'Due today', className: 'bg-orange-100 text-orange-700' };
  if (days <= 3) return { label: `${days}d left`, className: 'bg-yellow-100 text-yellow-700' };
  return { label: `${days}d left`, className: 'bg-blue-100 text-blue-700' };
}

function getPriorityBadge(priority: string): { label: string; className: string } {
  switch (priority) {
    case 'high':
      return { label: 'High', className: 'bg-red-100 text-red-700' };
    case 'low':
      return { label: 'Low', className: 'bg-gray-100 text-gray-600' };
    default:
      return { label: 'Medium', className: 'bg-yellow-100 text-yellow-700' };
  }
}

export default async function DeadlinesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(and(eq(tasks.teamId, teamId), isNotNull(tasks.deadline)));

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      deadline: projects.deadline,
      status: projects.status,
    })
    .from(projects)
    .where(and(eq(projects.teamId, teamId), isNotNull(projects.deadline)));

  const allProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.teamId, teamId));

  const allTasks = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.teamId, teamId));

  const deadlines: DeadlineItem[] = [];

  for (const t of taskRows) {
    if (t.deadline) {
      deadlines.push({
        id: t.id,
        type: 'task',
        title: t.title,
        deadline: t.deadline,
        status: t.status,
        priority: t.priority,
        projectId: t.projectId,
      });
    }
  }

  for (const p of projectRows) {
    if (p.deadline) {
      deadlines.push({
        id: p.id,
        type: 'project',
        title: p.name,
        deadline: p.deadline,
        status: p.status,
      });
    }
  }

  deadlines.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  const overdueCount = deadlines.filter((d) => {
    if (d.status === 'done' || d.status === 'completed') return false;
    return getDaysUntil(d.deadline) < 0;
  }).length;

  const dueTodayCount = deadlines.filter((d) => {
    if (d.status === 'done' || d.status === 'completed') return false;
    return getDaysUntil(d.deadline) === 0;
  }).length;

  const upcomingCount = deadlines.filter((d) => {
    if (d.status === 'done' || d.status === 'completed') return false;
    const days = getDaysUntil(d.deadline);
    return days > 0 && days <= 7;
  }).length;

  async function setDeadline(formData: FormData) {
    'use server';
    const { userId: clerkId } = await auth();
    if (!clerkId) return;

    const teamId = await getTeamIdByClerkId(clerkId);
    if (!teamId) return;

    const entityType = formData.get('entityType') as 'task' | 'project';
    const entityId = parseInt(formData.get('entityId') as string, 10);
    const deadline = formData.get('deadline') as string;

    if (!entityType || !entityId || !deadline) return;

    if (entityType === 'task') {
      await db
        .update(tasks)
        .set({ deadline, updatedAt: new Date() })
        .where(and(eq(tasks.id, entityId), eq(tasks.teamId, teamId)));
    } else if (entityType === 'project') {
      await db
        .update(projects)
        .set({ deadline, updatedAt: new Date() })
        .where(and(eq(projects.id, entityId), eq(projects.teamId, teamId)));
    }

    revalidatePath('/deadlines');
  }

  async function clearDeadline(formData: FormData) {
    'use server';
    const { userId: clerkId } = await auth();
    if (!clerkId) return;

    const teamId = await getTeamIdByClerkId(clerkId);
    if (!teamId) return;

    const entityType = formData.get('entityType') as 'task' | 'project';
    const entityId = parseInt(formData.get('entityId') as string, 10);

    if (!entityType || !entityId) return;

    if (entityType === 'task') {
      await db
        .update(tasks)
        .set({ deadline: null, updatedAt: new Date() })
        .where(and(eq(tasks.id, entityId), eq(tasks.teamId, teamId)));
    } else if (entityType === 'project') {
      await db
        .update(projects)
        .set({ deadline: null, updatedAt: new Date() })
        .where(and(eq(projects.id, entityId), eq(projects.teamId, teamId)));
    }

    revalidatePath('/deadlines');
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deadlines</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track upcoming deadlines for your tasks and projects.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Overdue</p>
          <p className="text-3xl font-bold text-red-700 mt-1">{overdueCount}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Due Today</p>
          <p className="text-3xl font-bold text-orange-700 mt-1">{dueTodayCount}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">This Week</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{upcomingCount}</p>
        </div>
      </div>

      {/* Set Deadline Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Set a Deadline</h2>
        <form action={setDeadline} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              name="entityType"
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select type…</option>
              <option value="task">Task</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task or Project</label>
            <select
              name="entityId"
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select item…</option>
              <optgroup label="Tasks">
                {allTasks.map((t) => (
                  <option key={`task-${t.id}`} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Projects">
                {allProjects.map((p) => (
                  <option key={`project-${p.id}`} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Date</label>
            <input
              type="date"
              name="deadline"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Set Deadline
            </button>
          </div>
        </form>
      </div>

      {/* Deadlines Table */}
      {deadlines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">No deadlines set</h3>
          <p className="mt-1 text-sm text-gray-500">
            Use the form above to set deadlines on your tasks and projects.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Priority</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Countdown</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deadlines.map((item) => {
                const badge = getDeadlineBadge(item.deadline, item.status);
                const isOverdue =
                  item.status !== 'done' &&
                  item.status !== 'completed' &&
                  getDaysUntil(item.deadline) < 0;
                return (
                  <tr
                    key={`${item.type}-${item.id}`}
                    className={isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                      {item.title}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.type === 'project'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}
                      >
                        {item.type === 'project' ? 'Project' : 'Task'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(item.deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.priority ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            getPriorityBadge(item.priority).className
                          }`}
                        >
                          {getPriorityBadge(item.priority).label}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={clearDeadline}>
                        <input type="hidden" name="entityType" value={item.type} />
                        <input type="hidden" name="entityId" value={item.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          Clear
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}