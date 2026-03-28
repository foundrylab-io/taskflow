import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { projects, tasks, teamMembers } from '@/lib/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderKanban,
  CheckSquare,
  Users,
  AlertCircle,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
} from 'lucide-react';

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  // Fetch all stats in parallel
  const [
    totalProjectsResult,
    activeProjectsResult,
    totalTasksResult,
    todoTasksResult,
    inProgressTasksResult,
    doneTasksResult,
    overdueTasksResult,
    teamMembersResult,
    recentProjects,
    recentTasks,
  ] = await Promise.all([
    // Total projects
    db
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.teamId, teamId)),

    // Active projects
    db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.teamId, teamId), eq(projects.status, 'active'))),

    // Total tasks
    db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.teamId, teamId)),

    // Todo tasks
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.teamId, teamId), eq(tasks.status, 'todo'))),

    // In-progress tasks
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.teamId, teamId), eq(tasks.status, 'in_progress'))),

    // Done tasks
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.teamId, teamId), eq(tasks.status, 'done'))),

    // Overdue tasks (deadline < today AND status != done)
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.teamId, teamId),
          sql`${tasks.deadline} < CURRENT_DATE`,
          sql`${tasks.status} != 'done'`
        )
      ),

    // Team members count
    db
      .select({ value: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId)),

    // Recent projects
    db
      .select()
      .from(projects)
      .where(eq(projects.teamId, teamId))
      .orderBy(sql`${projects.createdAt} desc`)
      .limit(5),

    // Recent tasks
    db
      .select()
      .from(tasks)
      .where(eq(tasks.teamId, teamId))
      .orderBy(sql`${tasks.createdAt} desc`)
      .limit(5),
  ]);

  const totalProjects = totalProjectsResult[0]?.value ?? 0;
  const activeProjects = activeProjectsResult[0]?.value ?? 0;
  const totalTasks = totalTasksResult[0]?.value ?? 0;
  const todoTasks = todoTasksResult[0]?.value ?? 0;
  const inProgressTasks = inProgressTasksResult[0]?.value ?? 0;
  const doneTasks = doneTasksResult[0]?.value ?? 0;
  const overdueTasks = overdueTasksResult[0]?.value ?? 0;
  const memberCount = teamMembersResult[0]?.value ?? 0;

  const completionRate =
    Number(totalTasks) > 0
      ? Math.round((Number(doneTasks) / Number(totalTasks)) * 100)
      : 0;

  const priorityColor: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };

  const statusColor: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
    done: 'bg-green-100 text-green-700 border-green-200',
    active: 'bg-blue-100 text-blue-700 border-blue-200',
    completed: 'bg-green-100 text-green-700 border-green-200',
    archived: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const statusLabel: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
    active: 'Active',
    completed: 'Completed',
    archived: 'Archived',
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Overview of your team&apos;s projects and tasks
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/projects/new">
              <Plus className="w-4 h-4 mr-1" />
              New Project
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/tasks/new">
              <Plus className="w-4 h-4 mr-1" />
              New Task
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Active Projects
            </CardTitle>
            <FolderKanban className="w-5 h-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {activeProjects.toString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {totalProjects.toString()} total projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Tasks In Progress
            </CardTitle>
            <CheckSquare className="w-5 h-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {inProgressTasks.toString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {todoTasks.toString()} to do · {doneTasks.toString()} done
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Completion Rate
            </CardTitle>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {completionRate}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {doneTasks.toString()} of {totalTasks.toString()} tasks completed
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            Number(overdueTasks) > 0 ? 'border-red-200 bg-red-50' : ''
          }
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle
              className={`text-sm font-medium ${Number(overdueTasks) > 0 ? 'text-red-600' : 'text-gray-600'}`}
            >
              Overdue Tasks
            </CardTitle>
            <AlertCircle
              className={`w-5 h-5 ${Number(overdueTasks) > 0 ? 'text-red-500' : 'text-gray-400'}`}
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${Number(overdueTasks) > 0 ? 'text-red-700' : 'text-gray-900'}`}
            >
              {overdueTasks.toString()}
            </div>
            <p
              className={`text-xs mt-1 ${Number(overdueTasks) > 0 ? 'text-red-500' : 'text-gray-500'}`}
            >
              {Number(overdueTasks) > 0
                ? 'Needs attention'
                : 'All tasks on track'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Task Breakdown + Team Members */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Task Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                label: 'To Do',
                value: Number(todoTasks),
                color: 'bg-slate-400',
              },
              {
                label: 'In Progress',
                value: Number(inProgressTasks),
                color: 'bg-blue-500',
              },
              {
                label: 'Done',
                value: Number(doneTasks),
                color: 'bg-green-500',
              },
            ].map((item) => {
              const pct =
                Number(totalTasks) > 0
                  ? Math.round((item.value / Number(totalTasks)) * 100)
                  : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">
                      {item.label}
                    </span>
                    <span className="text-gray-500">
                      {item.value} task{item.value !== 1 ? 's' : ''} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {memberCount.toString()}
                </div>
                <p className="text-xs text-gray-500">Team members</p>
              </div>
            </div>
            <div className="pt-2 space-y-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/team">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Team
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/team/invite">
                  <Plus className="w-4 h-4 mr-2" />
                  Invite Member
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Projects + Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Projects
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/projects" className="flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No projects yet</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/projects/new">Create your first project</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {project.name}
                        </p>
                        {project.deadline && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            Due {new Date(project.deadline).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`ml-2 text-xs shrink-0 ${statusColor[project.status] ?? ''}`}
                      >
                        {statusLabel[project.status] ?? project.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Recent Tasks
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/tasks" className="flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No tasks yet</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/tasks/new">Create your first task</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {recentTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/tasks/${task.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {task.title}
                        </p>
                        {task.deadline && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            Due {new Date(task.deadline).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-xs ${priorityColor[task.priority] ?? ''}`}
                        >
                          {task.priority}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusColor[task.status] ?? ''}`}
                        >
                          {statusLabel[task.status] ?? task.status}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button
              asChild
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
            >
              <Link href="/projects/new">
                <FolderKanban className="w-5 h-5 text-blue-500" />
                <span className="text-xs font-medium">New Project</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
            >
              <Link href="/tasks/new">
                <CheckSquare className="w-5 h-5 text-indigo-500" />
                <span className="text-xs font-medium">New Task</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
            >
              <Link href="/team/invite">
                <Users className="w-5 h-5 text-purple-500" />
                <span className="text-xs font-medium">Invite Member</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
            >
              <Link href="/tasks?status=in_progress">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <span className="text-xs font-medium">View In Progress</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}