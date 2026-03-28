import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { tasks, projects, users, teamMembers } from '@/lib/db/schema';
import { getTeamIdByClerkId, ensureUserExists } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClipboardList, Plus, UserCheck } from 'lucide-react';

export default async function AssignmentsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  const dbUser = await ensureUserExists(clerkId);
  if (!dbUser) redirect('/sign-in');

  // Load all tasks with assignments for this team
  const assignmentRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      deadline: tasks.deadline,
      projectId: tasks.projectId,
      assigneeId: tasks.assigneeId,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(eq(tasks.teamId, teamId))
    .orderBy(desc(tasks.createdAt))
    .limit(100);

  // Load projects for the team
  const teamProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.teamId, teamId), eq(projects.status, 'active')));

  // Load team members with user info
  const members = await db
    .select({
      userId: teamMembers.userId,
      name: users.name,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  // Build lookup maps
  const projectMap = new Map(teamProjects.map((p) => [p.id, p.name]));
  const memberMap = new Map(
    members.map((m) => [m.userId, m.name ?? m.email])
  );

  async function createAssignment(formData: FormData) {
    'use server';

    const { userId: clerkId2 } = await auth();
    if (!clerkId2) redirect('/sign-in');

    const teamId2 = await getTeamIdByClerkId(clerkId2);
    if (!teamId2) redirect('/sign-in');

    const currentUser = await ensureUserExists(clerkId2);
    if (!currentUser) redirect('/sign-in');

    const title = (formData.get('title') as string | null)?.trim() ?? '';
    const description = (formData.get('description') as string | null)?.trim() ?? null;
    const projectIdRaw = formData.get('projectId') as string | null;
    const assigneeIdRaw = formData.get('assigneeId') as string | null;
    const priority = (formData.get('priority') as string | null) ?? 'medium';
    const deadline = (formData.get('deadline') as string | null) ?? null;

    if (!title || !projectIdRaw) return;

    const projectId = parseInt(projectIdRaw, 10);
    if (isNaN(projectId)) return;

    const assigneeId =
      assigneeIdRaw && assigneeIdRaw !== 'unassigned'
        ? parseInt(assigneeIdRaw, 10)
        : null;

    await db.insert(tasks).values({
      userId: currentUser.id,
      teamId: teamId2,
      projectId,
      title,
      description,
      status: 'todo',
      priority,
      deadline: deadline || null,
      assigneeId: assigneeId && !isNaN(assigneeId) ? assigneeId : null,
    });

    revalidatePath('/assignments');
  }

  async function updateAssignee(formData: FormData) {
    'use server';

    const { userId: clerkId3 } = await auth();
    if (!clerkId3) redirect('/sign-in');

    const teamId3 = await getTeamIdByClerkId(clerkId3);
    if (!teamId3) redirect('/sign-in');

    const taskIdRaw = formData.get('taskId') as string | null;
    const assigneeIdRaw = formData.get('assigneeId') as string | null;

    if (!taskIdRaw) return;

    const taskId = parseInt(taskIdRaw, 10);
    if (isNaN(taskId)) return;

    const assigneeId =
      assigneeIdRaw && assigneeIdRaw !== 'unassigned'
        ? parseInt(assigneeIdRaw, 10)
        : null;

    await db
      .update(tasks)
      .set({
        assigneeId: assigneeId && !isNaN(assigneeId) ? assigneeId : null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.teamId, teamId3)));

    revalidatePath('/assignments');
  }

  async function updateStatus(formData: FormData) {
    'use server';

    const { userId: clerkId4 } = await auth();
    if (!clerkId4) redirect('/sign-in');

    const teamId4 = await getTeamIdByClerkId(clerkId4);
    if (!teamId4) redirect('/sign-in');

    const taskIdRaw = formData.get('taskId') as string | null;
    const status = formData.get('status') as string | null;

    if (!taskIdRaw || !status) return;

    const taskId = parseInt(taskIdRaw, 10);
    if (isNaN(taskId)) return;

    await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.teamId, teamId4)));

    revalidatePath('/assignments');
  }

  const priorityColor: Record<string, string> = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  };

  const statusColor: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign tasks to team members and track their progress.
          </p>
        </div>
      </div>

      {/* Create Assignment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            New Assignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAssignment} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1 lg:col-span-2">
              <Label htmlFor="title">Task Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Design landing page"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="projectId">Project</Label>
              <select
                id="projectId"
                name="projectId"
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select project…</option>
                {teamProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="assigneeId">Assignee</Label>
              <select
                id="assigneeId"
                name="assigneeId"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="unassigned">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>

            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                name="description"
                placeholder="Add more context…"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <Button type="submit" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Assignment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Assignments Table */}
      {assignmentRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-1">No assignments yet</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              Create your first assignment above to start tracking tasks across your team.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4" />
              All Assignments
              <span className="ml-auto text-muted-foreground font-normal text-sm">
                {assignmentRows.length} task{assignmentRows.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentRows.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {task.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {projectMap.get(task.projectId) ?? '—'}
                    </TableCell>
                    <TableCell>
                      {task.assigneeId ? (
                        <span className="text-sm">
                          {memberMap.get(task.assigneeId) ?? '—'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          priorityColor[task.priority] ??
                          'bg-slate-100 text-slate-700'
                        }
                        variant="outline"
                      >
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          statusColor[task.status] ??
                          'bg-slate-100 text-slate-700'
                        }
                        variant="outline"
                      >
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.deadline ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Reassign */}
                        <form action={updateAssignee} className="flex items-center gap-1">
                          <input type="hidden" name="taskId" value={task.id} />
                          <select
                            name="assigneeId"
                            defaultValue={task.assigneeId?.toString() ?? 'unassigned'}
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="unassigned">Unassigned</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.name ?? m.email}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="outline" size="sm" className="h-7 text-xs px-2">
                            Assign
                          </Button>
                        </form>

                        {/* Update Status */}
                        <form action={updateStatus} className="flex items-center gap-1">
                          <input type="hidden" name="taskId" value={task.id} />
                          <select
                            name="status"
                            defaultValue={task.status}
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="todo">Todo</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                          <Button type="submit" variant="outline" size="sm" className="h-7 text-xs px-2">
                            Update
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}