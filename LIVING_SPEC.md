# TaskFlow — Living Spec

## Overview
A self-serve task management SaaS that lets small startups and remote teams create projects, assign tasks, and track progress in one place.

## Stack
- Framework: Next.js 15 (App Router) + TypeScript
- Database: PostgreSQL via Drizzle ORM
- Auth: Clerk v7
- UI: shadcn/ui + Tailwind CSS
- Deployment: Railway

## Database Tables
- users
- teams
- teamMembers
- activityLogs
- invitations
- projects
- tasks
- taskComments

## Pages
- /users
- /teams
- /projects
- /tasks
- /assignments
- /statuses
- /deadlines
- /dashboard

## API Routes
- /api/users
- /api/teams
- /api/projects
- /api/tasks
- /api/assignments
- /api/statuses
- /api/deadlines

## Features Built
- Design database schema
- Generate pages and API routes
- Deploy to Railway
- Run validation

## Deployment
- Last updated: 2026-03-28 15:10 UTC


## Fix — 2026-03-28 15:26 UTC
- Fixed: In app/(dashboard)/layout.tsx, find the <span> element inside the sidebar logo section that reads 'ProjectFlow' and change it to 'TaskFlow'. The exact line is: <span className="text-lg font-semibold text-gray-900">ProjectFlow</span> — change 'ProjectFlow' to 'TaskFlow'.
- Files changed: app/(dashboard)/layout.tsx
