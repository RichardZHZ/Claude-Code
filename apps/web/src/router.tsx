import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { isValidDate, isValidWeekKey } from '@researchpilot/core/week';
import { AppShell, NotFound } from '@/components/layout/app-shell';
import { InboxPage } from '@/pages/inbox-page';
import { MapPage } from '@/pages/map-page';
import { ProjectPage } from '@/pages/project-page';
import { TodayPage } from '@/pages/today-page';
import { WeekPage } from '@/pages/week-page';

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/today' });
  },
});

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/today',
  validateSearch: (search: Record<string, unknown>): { d?: string } =>
    typeof search.d === 'string' && isValidDate(search.d) ? { d: search.d } : {},
  component: TodayPage,
});

const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/week',
  validateSearch: (search: Record<string, unknown>): { w?: string } =>
    typeof search.w === 'string' && isValidWeekKey(search.w) ? { w: search.w } : {},
  component: WeekPage,
});

const mapRoute = createRoute({ getParentRoute: () => rootRoute, path: '/map', component: MapPage });

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectPage,
});

const inboxRoute = createRoute({ getParentRoute: () => rootRoute, path: '/inbox', component: InboxPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, todayRoute, weekRoute, mapRoute, projectRoute, inboxRoute]),
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
