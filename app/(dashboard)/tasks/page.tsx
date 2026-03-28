import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { tasks, projects, users, teamMembers } from '@/lib/db/schema';
import { getTeamIdByClerkId, ensureUserExists } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Plus, AlertCircle } from 'lucide-react';

type TaskWithRelations = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  projectId: number;
  projectName: string | null;
  assigneeName: string | null;
  createdAt: Date;
};

type ProjectOption = { id: number; name: string };
type MemberOption = { id: number; name: string | null; email: string };

function getPriorityVariant(
  priority: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (priority) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getStatusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'done':
      return 'default';
    case 'in_progress':
      return 'secondary';
    case 'todo':
      return 'outline';
    default:
      return 'outline';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'todo':
      return 'To Do';
    case 'in_progress':
      return 'In Progress';
    case 'done':
      return 'Done';
    default:
      return status;
  }
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === 'done') return false;
  return new Date(deadline) < new Date();
}

export default async function TasksPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const user = await ensureUserExists(clerkId);
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  // Fetch tasks with project and assignee info
  const rawTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      deadline: tasks.deadline,
      projectId: tasks.projectId,
      projectName: projects.name,
      assigneeName: users.name,
      assigneeEmail: users.email,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.teamId, teamId))
    .orderBy(desc(tasks.createdAt))
    .limit(100);

  const taskList: TaskWithRelations[] = rawTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    projectId: t.projectId,
    projectName: t.projectName ?? null,
    assigneeName: t.assigneeName ?? t.assigneeEmail ?? null,
    createdAt: t.createdAt,
  }));

  // Fetch projects for the create form
  const projectOptions: ProjectOption[] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.teamId, teamId), eq(projects.status, 'active')))
    .orderBy(projects.name);

  // Fetch team members for assignee dropdown
  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  const memberOptions: MemberOption[] = memberRows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
  }));

  // Stats
  const totalTasks = taskList.length;
  const todoCount = taskList.filter((t) => t.status === 'todo').length;
  const inProgressCount = taskList.filter((t) => t.status === 'in_progress').length;
  const doneCount = taskList.filter((t) => t.status === 'done').length;
  const overdueCount = taskList.filter((t) => isOverdue(t.deadline, t.status)).length;

  async function createTask(formData: FormData) {
    'use server';

    const { userId: clerkId } = await auth();
    if (!clerkId) redirect('/sign-in');

    const currentUser = await ensureUserExists(clerkId);
    if (!currentUser) redirect('/sign-in');

    const currentTeamId = await getTeamIdByClerkId(clerkId);
    if (!currentTeamId) redirect('/sign-in');

    const title = (formData.get('title') as string)?.trim();
    if (!title) return;

    const projectIdRaw = formData.get('projectId') as string;
    const projectId = parseInt(projectIdRaw, 10);
    if (isNaN(projectId)) return;

    const description = (formData.get('description') as string)?.trim() || null;
    const status = (formData.get('status') as string) || 'todo';
    const priority = (formData.get('priority') as string) || 'medium';
    const deadlineRaw = (formData.get('deadline') as string)?.trim();
    const deadline = deadlineRaw || null;

    const assigneeIdRaw = formData.get('assigneeId') as string;
    let assigneeId: number | null = null;
    if (assigneeIdRaw && assigneeIdRaw !== 'none') {
      const parsed = parseInt(assigneeIdRaw, 10);
      if (!isNaN(parsed)) assigneeId = parsed;
    }

    await db.insert(tasks).values({
      userId: currentUser.id,
      teamId: currentTeamId,
      projectId,
      title,
      description,
      status,
      priority,
      deadline,
      assigneeId,
    });

    revalidatePath('/tasks');
  }

  async function updateTaskStatus(formData: FormData) {
    'use server';

    const { userId: clerkId } = await auth();
    if (!clerkId) redirect('/sign-in');

    const currentTeamId = await getTeamIdByClerkId(clerkId);
    if (!currentTeamId) redirect('/sign-in');

    const taskId = parseInt(formData.get('taskId') as string, 10);
    const newStatus = formData.get('status') as string;
    if (isNaN(taskId) || !newStatus) return;

    await db
      .update(tasks)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.teamId, currentTeamId)));

    revalidatePath('/tasks');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and track your team&apos;s tasks
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tasks</CardDescription>
            <CardTitle className="text-3xl">{totalTasks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>To Do</CardDescription>
            <CardTitle className="text-3xl">{todoCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Progress</CardDescription>
            <CardTitle className="text-3xl">{inProgressCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{doneCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {overdueCount} task{overdueCount > 1 ? 's are' : ' is'} overdue and need
            {overdueCount === 1 ? 's' : ''} attention.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Create Task Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-4 w-4" />
              New Task
            </CardTitle>
            <CardDescription>Add a task to a project</CardDescription>
          </CardHeader>
          <CardContent>
            {projectOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You need at least one active project before creating tasks.{' '}
                <a href="/projects" className="underline text-foreground hover:opacity-80">
                  Create a project
                </a>
              </p>
            ) : (
              <form action={createTask} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Task title"
                    required
                    maxLength={255}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="projectId">Project *</Label>
                  <select
                    id="projectId"
                    name="projectId"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select a project</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue="todo"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <select
                    id="priority"
                    name="priority"
                    defaultValue="medium"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="assigneeId">Assignee</Label>
                  <select
                    id="assigneeId"
                    name="assigneeId"
                    defaultValue="none"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="none">Unassigned</option>
                    {memberOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? m.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" name="deadline" type="date" />
                </div>

                <Button type="submit" className="w-full">
                  Create Task
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Task List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="h-4 w-4" />
              All Tasks
            </CardTitle>
            <CardDescription>
              {totalTasks === 0
                ? 'No tasks yet'
                : `${totalTasks} task${totalTasks !== 1 ? 's' : ''} across all projects`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {taskList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No tasks yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first task using the form on the left.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskList.map((task) => {
                      const overdue = isOverdue(task.deadline, task.status);
                      return (
                        <TableRow key={task.id} className={overdue ? 'bg-destructive/5' : ''}>
                          <TableCell className="font-medium max-w-[160px] truncate">
                            <span title={task.title}>{task.title}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[120px] truncate">
                            <span title={task.projectName ?? ''}>{task.projectName ?? '—'}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(task.status)}>
                              {getStatusLabel(task.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getPriorityVariant(task.priority)}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {task.assigneeName ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {task.deadline ? (
                              <span className={overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                                {new Date(task.deadline).toLocaleDateString()}
                                {overdue && ' ⚠'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <form action={updateTaskStatus}>
                              <input type="hidden" name="taskId" value={task.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={
                                  task.status === 'todo'
                                    ? 'in_progress'
                                    : task.status === 'in_progress'
                                    ? 'done'
                                    : 'todo'
                                }
                              />
                              <Button type="submit" variant="outline" size="sm" className="text-xs whitespace-nowrap">
                                {task.status === 'todo'
                                  ? 'Start'
                                  : task.status === 'in_progress'
                                  ? 'Complete'
                                  : 'Reopen'}
                              </Button>
                            </form>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}