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
  GitBranch,
  Activity,
  Calendar,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/teams', label: 'Teams', icon: UsersRound },
  { href: '/assignments', label: 'Assignments', icon: GitBranch },
  { href: '/statuses', label: 'Statuses', icon: Activity },
  { href: '/deadlines', label: 'Deadlines', icon: Calendar },
  { href: '/users', label: 'Users', icon: Users },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-indigo-600" />
            <span className="text-lg font-semibold text-gray-900">
              ProjectFlow
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-indigo-50 hover:text-indigo-700 transition-colors group"
            >
              <Icon className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="flex items-center gap-3 px-4 py-4 border-t border-gray-200">
          <UserButton />
          <span className="text-sm text-gray-600 truncate">My Account</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}