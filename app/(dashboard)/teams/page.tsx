import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers, users } from '@/lib/db/schema';
import { getTeamIdByClerkId, ensureUserExists } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, ShieldCheck, User } from 'lucide-react';

type TeamWithMembers = {
  id: number;
  name: string;
  planName: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  memberCount: number;
  members: {
    id: number;
    role: string;
    userName: string | null;
    userEmail: string;
    joinedAt: Date;
  }[];
};

export default async function TeamsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const teamId = await getTeamIdByClerkId(clerkId);
  if (!teamId) redirect('/sign-in');

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .orderBy(desc(teams.createdAt))
    .limit(100);

  const teamsWithMembers: TeamWithMembers[] = await Promise.all(
    teamRows.map(async (team) => {
      const memberRows = await db
        .select({
          id: teamMembers.id,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, team.id))
        .orderBy(teamMembers.joinedAt);

      return {
        id: team.id,
        name: team.name,
        planName: team.planName,
        subscriptionStatus: team.subscriptionStatus,
        createdAt: team.createdAt,
        memberCount: memberRows.length,
        members: memberRows,
      };
    })
  );

  async function createTeam(formData: FormData) {
    'use server';

    const { userId: clerkId } = await auth();
    if (!clerkId) redirect('/sign-in');

    const user = await ensureUserExists(clerkId);
    if (!user) redirect('/sign-in');

    const name = formData.get('name');
    if (!name || typeof name !== 'string' || name.trim().length === 0) return;

    const trimmedName = name.trim().slice(0, 100);

    const [newTeam] = await db
      .insert(teams)
      .values({ name: trimmedName })
      .returning();

    if (!newTeam) return;

    await db.insert(teamMembers).values({
      userId: user.id,
      teamId: newTeam.id,
      role: 'owner',
    });

    revalidatePath('/teams');
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default' as const;
      case 'admin':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  const getSubscriptionBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'active':
        return 'default' as const;
      case 'trialing':
        return 'secondary' as const;
      case 'past_due':
      case 'canceled':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team and collaborate with members.
          </p>
        </div>
      </div>

      {/* Create Team Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" />
            Create New Team
          </CardTitle>
          <CardDescription>
            Start a new team to collaborate on projects and tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createTeam} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="name">Team Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Engineering, Marketing, Design…"
                maxLength={100}
                required
              />
            </div>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Teams List */}
      {teamsWithMembers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Users className="text-muted-foreground h-8 w-8" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">No teams yet</h3>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create your first team above to start collaborating on projects
              and assigning tasks to members.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {teamsWithMembers.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {team.name}
                    </CardTitle>
                    <CardDescription>
                      Created{' '}
                      {team.createdAt.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {' · '}
                      {team.memberCount}{' '}
                      {team.memberCount === 1 ? 'member' : 'members'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.planName && (
                      <Badge variant="secondary">{team.planName}</Badge>
                    )}
                    {team.subscriptionStatus && (
                      <Badge
                        variant={getSubscriptionBadgeVariant(
                          team.subscriptionStatus
                        )}
                      >
                        {team.subscriptionStatus}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {team.members.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No members in this team yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {team.members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {member.role === 'owner' ? (
                                <ShieldCheck className="text-primary h-4 w-4 shrink-0" />
                              ) : (
                                <User className="text-muted-foreground h-4 w-4 shrink-0" />
                              )}
                              <span className="font-medium">
                                {member.userName ?? '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.userEmail}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getRoleBadgeVariant(member.role)}
                              className="capitalize"
                            >
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.joinedAt.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}