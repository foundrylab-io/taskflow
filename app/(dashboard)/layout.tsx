import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  FolderKanban,
  CheckSquare,
  UserCheck,
  Tag,
  CalendarClock,
} from 'lucide-react';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    label: 'Tasks',
    href: '/tasks',
    icon: CheckSquare,
  },
  {
    label: 'Teams',
    href: '/teams',
    icon: UsersRound,
  },
  {
    label: 'Assignments',
    href: '/assignments',
    icon: UserCheck,
  },
  {
    label: 'Deadlines',
    href: '/deadlines',
    icon: CalendarClock,
  },
  {
    label: 'Statuses',
    href: '/statuses',
    icon: Tag,
  },
  {
    label: 'Users',
    href: '/users',
    icon: Users,
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        {/* Logo / App name */}
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-indigo-600" />
            <span className="text-lg font-semibold text-gray-900">
              ProjectFlow
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.href} href={item.href} icon={Icon} label={item.label} />
            );
          })}
        </nav>

        {/* User section */}
        <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-4">
          <UserButton />
          <span className="text-sm text-gray-600">Account</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}

// Client component for active link highlighting
import { NavLink } from '@/components/nav-link';