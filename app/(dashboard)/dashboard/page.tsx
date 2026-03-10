import { db } from '@/lib/db/drizzle';
import { projects, tasks, notes } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FolderPlus,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Target,
  StickyNote,
  Trash2
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function createProject(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;

  const name = formData.get('name') as string;
  const description = formData.get('description') as string;

  if (!name) return;

  const color = formData.get('color') as string;

  await db.insert(projects).values({
    userId: user.id,
    name,
    description,
    color: color || '#6366f1',
  });

  revalidatePath('/dashboard');
}

async function createTask(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;

  const title = formData.get('title') as string;
  const projectId = parseInt(formData.get('projectId') as string);
  const priority = formData.get('priority') as string;
  const dueDate = formData.get('dueDate') as string;

  if (!title || !projectId) return;

  await db.insert(tasks).values({
    userId: user.id,
    projectId,
    title,
    priority: priority || 'medium',
    dueDate: dueDate || null,
  });

  revalidatePath('/dashboard');
}

async function toggleTaskComplete(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;

  const taskId = parseInt(formData.get('taskId') as string);
  const isCompleted = formData.get('isCompleted') === 'true';

  await db.update(tasks)
    .set({
      status: isCompleted ? 'done' : 'todo',
      completedAt: isCompleted ? new Date() : null,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

  revalidatePath('/dashboard');
}

async function createNote(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;

  const content = formData.get('content') as string;
  if (!content || !content.trim()) return;

  await db.insert(notes).values({
    userId: user.id,
    content: content.trim(),
  });

  revalidatePath('/dashboard');
}

async function deleteNote(formData: FormData) {
  'use server';

  const user = await getUser();
  if (!user) return;

  const noteId = parseInt(formData.get('noteId') as string);
  if (!noteId) return;

  await db.delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)));

  revalidatePath('/dashboard');
}

export default async function Dashboard() {
  const user = await getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const userProjects = await db.query.projects.findMany({
    where: and(eq(projects.userId, user.id), eq(projects.isArchived, false)),
    with: {
      tasks: true,
    },
  });

  const userTasks = await db.query.tasks.findMany({
    where: eq(tasks.userId, user.id),
    with: {
      project: true,
    },
  });

  const userNotes = await db.query.notes.findMany({
    where: eq(notes.userId, user.id),
    orderBy: [desc(notes.createdAt)],
  });

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const overdueTasks = userTasks.filter(task =>
    task.dueDate &&
    task.dueDate < todayStr &&
    task.status !== 'done'
  );

  const upcomingTasks = userTasks.filter(task =>
    task.dueDate &&
    task.dueDate >= todayStr &&
    task.dueDate <= weekFromNow &&
    task.status !== 'done'
  );

  const completedTasks = userTasks.filter(task => task.status === 'done');
  const totalTasks = userTasks.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-sm text-muted-foreground">
          Welcome back, {user.name || 'User'}
        </div>
      </div>

      {/* Stats Overview — colored tint backgrounds */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FolderPlus className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userProjects.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <Target className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueTasks.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout: main content (2/3) + Quick Notes sidebar (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Project */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderPlus className="h-5 w-5" />
                  Create New Project
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createProject} className="space-y-4">
                  <Input
                    name="name"
                    placeholder="Project name"
                    required
                  />
                  <Input
                    name="description"
                    placeholder="Project description (optional)"
                  />
                  <div className="flex items-center gap-3">
                    <label htmlFor="project-color" className="text-sm text-muted-foreground">Color</label>
                    <input
                      id="project-color"
                      name="color"
                      type="color"
                      defaultValue="#6366f1"
                      className="h-9 w-14 rounded border border-input cursor-pointer"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Create Project
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Create Task */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create New Task
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createTask} className="space-y-4">
                  <Input
                    name="title"
                    placeholder="Task title"
                    required
                  />
                  <select
                    name="projectId"
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    required
                  >
                    <option value="">Select a project</option>
                    {userProjects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      name="priority"
                      className="px-3 py-2 border border-input bg-background rounded-md"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                    <Input
                      name="dueDate"
                      type="date"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={userProjects.length === 0}>
                    {userProjects.length === 0 ? 'Create a project first' : 'Create Task'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Overdue Tasks */}
          {overdueTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Overdue Tasks ({overdueTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdueTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {task.project.name} &middot; Due: {task.dueDate} &middot; {task.priority} priority
                        </div>
                      </div>
                      <form action={toggleTaskComplete}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="isCompleted" value="true" />
                        <Button variant="outline" size="sm" type="submit">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Tasks */}
          {upcomingTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Tasks ({upcomingTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {upcomingTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {task.project.name} &middot; Due: {task.dueDate} &middot; {task.priority} priority
                        </div>
                      </div>
                      <form action={toggleTaskComplete}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="isCompleted" value="true" />
                        <Button variant="outline" size="sm" type="submit">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Projects — renamed from "Your Projects", with count badge */}
          {userProjects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderPlus className="h-5 w-5" />
                  Projects
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {userProjects.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userProjects.map(project => {
                    const projectTasks = project.tasks || [];
                    const completedCount = projectTasks.filter(t => t.status === 'done').length;

                    const pct = projectTasks.length > 0
                      ? Math.round((completedCount / projectTasks.length) * 100)
                      : 0;

                    return (
                      <div key={project.id} className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: project.color || '#6366f1' }}
                          />
                          <h3 className="font-medium">{project.name}</h3>
                        </div>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {project.description}
                          </p>
                        )}
                        <div className="text-xs text-muted-foreground mb-2">
                          {completedCount}/{projectTasks.length} tasks completed
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: project.color || '#6366f1',
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — Quick Notes sidebar */}
        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="h-5 w-5" />
                Quick Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createNote} className="space-y-3 mb-6">
                <textarea
                  name="content"
                  placeholder="Write a quick note..."
                  required
                  className="w-full min-h-[80px] px-3 py-2 border border-input bg-background rounded-md text-sm resize-y"
                />
                <Button type="submit" className="w-full">
                  Save Note
                </Button>
              </form>

              {userNotes.length > 0 ? (
                <div className="space-y-3">
                  {userNotes.map(note => (
                    <div key={note.id} className="flex items-start justify-between gap-3 p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(note.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <form action={deleteNote}>
                        <input type="hidden" name="noteId" value={note.id} />
                        <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No notes yet. Write your first note above.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
