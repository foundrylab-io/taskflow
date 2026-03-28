import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { tasks, projects } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-gray-100 text-gray-600',
};

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export default async function StatusesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  // Fetch task status counts
  const taskRows = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.teamId, teamId));

  const taskStatusCounts: Record<string, number> = {};
  for (const row of taskRows) {
    taskStatusCounts[row.status] = (taskStatusCounts[row.status] ?? 0) + 1;
  }

  const taskStatusData = TASK_STATUSES.map((status) => ({
    value: status,
    label: TASK_STATUS_LABELS[status],
    colorClass: TASK_STATUS_COLORS[status],
    count: taskStatusCounts[status] ?? 0,
  }));

  // Fetch project status counts
  const projectRows = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.teamId, teamId));

  const projectStatusCounts: Record<string, number> = {};
  for (const row of projectRows) {
    projectStatusCounts[row.status] = (projectStatusCounts[row.status] ?? 0) + 1;
  }

  const projectStatusData = PROJECT_STATUSES.map((status) => ({
    value: status,
    label: PROJECT_STATUS_LABELS[status],
    colorClass: PROJECT_STATUS_COLORS[status],
    count: projectStatusCounts[status] ?? 0,
  }));

  const totalTasks = taskRows.length;
  const totalProjects = projectRows.length;
  const hasAnyData = totalTasks > 0 || totalProjects > 0;

  // Server action: update task status
  async function updateTaskStatus(formData: FormData) {
    'use server';
    const { userId: clerkId } = await auth();
    if (!clerkId) redirect('/sign-in');

    const teamId = await getTeamIdByClerkId(clerkId);
    if (!teamId) redirect('/sign-in');

    const taskId = Number(formData.get('taskId'));
    const newStatus = formData.get('newStatus') as string;

    if (!taskId || !newStatus || !isTaskStatus(newStatus)) return;

    await db
      .update(tasks)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    revalidatePath('/statuses');
  }

  // Server action: update project status
  async function updateProjectStatus(formData: FormData) {
    'use server';
    const { userId: clerkId } = await auth();
    if (!clerkId) redirect('/sign-in');

    const teamId = await getTeamIdByClerkId(clerkId);
    if (!teamId) redirect('/sign-in');

    const projectId = Number(formData.get('projectId'));
    const newStatus = formData.get('newStatus') as string;

    if (!projectId || !newStatus || !isProjectStatus(newStatus)) return;

    await db
      .update(projects)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    revalidatePath('/statuses');
  }

  // Fetch recent tasks with their current status for the table
  const recentTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.teamId, teamId))
    .limit(20);

  // Fetch recent projects with their current status for the table
  const recentProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .limit(20);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Status Overview</h1>
        <p className="text-gray-500 mt-1">
          Track and manage statuses across tasks and projects.
        </p>
      </div>

      {!hasAnyData ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">No data yet</h2>
          <p className="text-gray-500 max-w-sm">
            Create tasks and projects to start tracking statuses. Once you have items, their
            status distribution will appear here.
          </p>
          <div className="flex gap-3 mt-6">
            <a
              href="/projects"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </a>
            <a
              href="/tasks"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Task Status Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Task Statuses</h2>
                <span className="text-sm text-gray-500">{totalTasks} total</span>
              </div>
              <div className="space-y-3">
                {taskStatusData.map((s) => (
                  <div key={s.value} className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-28 justify-center ${s.colorClass}`}
                    >
                      {s.label}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-current opacity-40"
                        style={{
                          width: totalTasks > 0 ? `${(s.count / totalTasks) * 100}%` : '0%',
                          backgroundColor:
                            s.value === 'done'
                              ? '#16a34a'
                              : s.value === 'in_progress'
                              ? '#2563eb'
                              : '#64748b',
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-6 text-right">
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Project Status Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Project Statuses</h2>
                <span className="text-sm text-gray-500">{totalProjects} total</span>
              </div>
              <div className="space-y-3">
                {projectStatusData.map((s) => (
                  <div key={s.value} className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-28 justify-center ${s.colorClass}`}
                    >
                      {s.label}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width:
                            totalProjects > 0
                              ? `${(s.count / totalProjects) * 100}%`
                              : '0%',
                          backgroundColor:
                            s.value === 'active'
                              ? '#059669'
                              : s.value === 'completed'
                              ? '#7c3aed'
                              : '#9ca3af',
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-6 text-right">
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Table */}
          {recentTasks.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Tasks</h2>
                <a
                  href="/tasks"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View all →
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Task</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Priority</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">
                        Update Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((task) => {
                      const currentStatus = isTaskStatus(task.status) ? task.status : 'todo';
                      return (
                        <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{task.title}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                task.priority === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : task.priority === 'medium'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TASK_STATUS_COLORS[currentStatus]}`}
                            >
                              {TASK_STATUS_LABELS[currentStatus]}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <form action={updateTaskStatus}>
                              <input type="hidden" name="taskId" value={task.id} />
                              <div className="flex items-center gap-2">
                                <select
                                  name="newStatus"
                                  defaultValue={currentStatus}
                                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {TASK_STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Projects Table */}
          {recentProjects.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Projects</h2>
                <a
                  href="/projects"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View all →
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Project</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-500">
                        Update Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentProjects.map((project) => {
                      const currentStatus = isProjectStatus(project.status)
                        ? project.status
                        : 'active';
                      return (
                        <tr
                          key={project.id}
                          className="border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="px-5 py-3 font-medium text-gray-800">{project.name}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PROJECT_STATUS_COLORS[currentStatus]}`}
                            >
                              {PROJECT_STATUS_LABELS[currentStatus]}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <form action={updateProjectStatus}>
                              <input type="hidden" name="projectId" value={project.id} />
                              <div className="flex items-center gap-2">
                                <select
                                  name="newStatus"
                                  defaultValue={currentStatus}
                                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  {PROJECT_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {PROJECT_STATUS_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}