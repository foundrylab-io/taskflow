import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { getTeamIdByClerkId } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';

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
  const query = searchParams.get('q');

  try {
    let allUsers;

    if (query) {
      const { sql } = await import('drizzle-orm');
      allUsers = await db
        .select()
        .from(users)
        .where(sql`${users.name} ILIKE ${'%' + query + '%'} OR ${users.email} ILIKE ${'%' + query + '%'}`)
        .orderBy(desc(users.createdAt))
        .limit(100);
    } else {
      allUsers = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(100);
    }

    return NextResponse.json(allUsers);
  } catch (error) {
    console.error('GET /api/users error:', error);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, role } = body as { name?: string; email?: string; role?: string };

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    const clerkIdPlaceholder = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const [newUser] = await db
      .insert(users)
      .values({
        clerkId: clerkIdPlaceholder,
        name: name ?? null,
        email,
        role: role ?? 'member',
      })
      .returning();

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}