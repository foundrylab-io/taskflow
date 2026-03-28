import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, desc, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { projects, tasks } from '@/lib/db/schema';
import { getTeamIdByClerkId, ensureUserExists } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Plus, Calendar, CheckSquare } from 'lucide-react';

function getStatusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'archived':
      return 'outline';
    default:
      return 'outline';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === 'completed' || status === 'archived') return false;
  return new Date(deadline) < new Date();
}

export default async function ProjectsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  const dbUser = await ensureUserExists(clerkId);
  if (!dbUser) redirect('/sign-in');

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      deadline: projects.deadline,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(projects.createdAt))
    .limit(100);

  const taskCounts = await db
    .select({
      projectId: tasks.projectId,
      total: count(tasks.id),
    })
    .from(tasks)
    .where(eq(tasks.teamId, teamId))
    .groupBy(tasks.projectId);

  const taskCountMap: Record<number, number> = {};
  for (const row of taskCounts) {
    taskCountMap[row.projectId] = Number(row.total);
  }

  const activeCount = projectRows.filter((p) => p.status === 'active').length;
  const completedCount = projectRows.filter((p) => p.status === 'completed').length;
  const overdueCount = projectRows.filter((p) => isOverdue(p.deadline, p.status)).length;

  async function createProject(formData: FormData) {
    'use server';

    const clerkIdInner = clerkId;
    if (!clerkIdInner) redirect('/sign-in');

    const teamIdInner = await getTeamIdByClerkId(clerkIdInner);
    if (!teamIdInner) redirect('/sign-in');

    const dbUserInner = await ensureUserExists(clerkIdInner);
    if (!dbUserInner) redirect('/sign-in');

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const status = (formData.get('status') as string) || 'active';
    const deadline = formData.get('deadline') as string;

    if (!name || name.trim() === '') return;

    await db.insert(projects).values({
      userId: dbUserInner.id,
      teamId: teamIdInner,
      name: name.trim(),
      description: description ? description.trim() : null,
      status,
      deadline: deadline ? deadline : null,
    });

    revalidatePath('/projects');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your team's projects and track progress
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Projects</CardDescription>
            <CardTitle className="text-3xl">{projectRows.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl">{activeCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{completedCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {overdueCount > 0 ? (
                <span className="text-destructive font-medium">
                  {overdueCount} overdue
                </span>
              ) : (
                'No overdue projects'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Form */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              New Project
            </CardTitle>
            <CardDescription>Create a new project for your team</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProject} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g. Website Redesign"
                  required
                  maxLength={255}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Briefly describe the project..."
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue="active"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  name="deadline"
                  type="date"
                />
              </div>

              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Projects Table */}
        <div className="lg:col-span-2">
          {projectRows.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">No projects yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Create your first project using the form to start organizing your team's work.
              </p>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Projects</CardTitle>
                <CardDescription>
                  {projectRows.length} project{projectRows.length !== 1 ? 's' : ''} total
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectRows.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium leading-tight">
                              {project.name}
                            </span>
                            {project.description && (
                              <span className="text-xs text-muted-foreground line-clamp-1 max-w-[180px]">
                                {project.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(project.status)}>
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            {project.deadline ? (
                              <>
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span
                                  className={
                                    isOverdue(project.deadline, project.status)
                                      ? 'text-destructive font-medium'
                                      : ''
                                  }
                                >
                                  {formatDate(project.deadline)}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckSquare className="h-3.5 w-3.5" />
                            <span>{taskCountMap[project.id] ?? 0}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/projects/${project.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}