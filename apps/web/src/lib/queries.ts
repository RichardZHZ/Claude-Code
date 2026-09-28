import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  ActivityDto,
  BackupInfoDto,
  BackupStatusDto,
  ResourceDto,
  ResourceOwnerType,
  ZoteroItemDto,
  CreateTaskInput,
  HealthReportDto,
  CountdownDto,
  DayViewDto,
  InboxListDto,
  OwnerOptionsDto,
  ProjectDetailDto,
  TaskViewDto,
  ThemeMapDto,
  UpdateTaskInput,
  WeekViewDto,
} from '@researchpilot/core/contracts';
import { api, type Health } from './api';

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get<Health>('/health', signal),
    refetchInterval: 30_000,
    retry: false,
  });

export const useThemeMap = () =>
  useQuery({ queryKey: ['map'], queryFn: ({ signal }) => api.get<ThemeMapDto>('/map', signal) });

export const useProject = (id: number) =>
  useQuery({
    queryKey: ['project', id],
    queryFn: ({ signal }) => api.get<ProjectDetailDto>(`/projects/${id}`, signal),
  });

export const useWeek = (weekKey: string) =>
  useQuery({
    queryKey: ['week', weekKey],
    queryFn: ({ signal }) => api.get<WeekViewDto>(`/weeks/${weekKey}`, signal),
  });

export const useDay = (date: string) =>
  useQuery({
    queryKey: ['day', date],
    queryFn: ({ signal }) => api.get<DayViewDto>(`/days/${date}`, signal),
  });

export const useInbox = () =>
  useQuery({ queryKey: ['inbox'], queryFn: ({ signal }) => api.get<InboxListDto>('/inbox', signal) });

export const useOwners = () =>
  useQuery({ queryKey: ['owners'], queryFn: ({ signal }) => api.get<OwnerOptionsDto>('/owners', signal) });

/** 挂在议题、课题或任务上的文献与链接。 */
export const useResources = (ownerType: ResourceOwnerType, ownerId: number) =>
  useQuery({
    queryKey: ['resources', ownerType, ownerId],
    queryFn: ({ signal }) =>
      api.get<ResourceDto[]>(`/resources?ownerType=${ownerType}&ownerId=${ownerId}`, signal),
  });

/** 在本机 Zotero 里搜索文献（经后端代理）。 */
export const useZoteroSearch = (query: string) =>
  useQuery({
    queryKey: ['zotero-search', query],
    queryFn: ({ signal }) =>
      api.get<ZoteroItemDto[]>(`/zotero/search?q=${encodeURIComponent(query)}&limit=15`, signal),
    enabled: query.trim().length > 0,
    retry: false,
    staleTime: 60_000,
  });

/** 数据库备份状态。 */
export const useBackups = () =>
  useQuery({
    queryKey: ['backups'],
    queryFn: ({ signal }) => api.get<BackupStatusDto>('/backups', signal),
    refetchInterval: 10 * 60_000,
    retry: false,
  });

/** 立即备份一次。 */
export const useBackupNow = () =>
  useAction(() => api.post<BackupInfoDto>('/backups', {}), { success: '已备份数据库' });

/** 健康检查提醒。today 取本机日期，避免服务端时区不同导致差一天。 */
export const useChecks = (today: string) =>
  useQuery({
    queryKey: ['checks', today],
    queryFn: ({ signal }) => api.get<HealthReportDto>(`/checks?today=${today}`, signal),
  });

/** 按 id 往前翻页的列表：每页最后一条的 id 作为下一页的 before。 */
function usePagedList<T extends { id: number }>(
  key: unknown[],
  path: string,
  params: Record<string, string>,
  pageSize: number,
) {
  return useInfiniteQuery({
    queryKey: [...key, params],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ ...params, limit: String(pageSize) });
      if (pageParam !== undefined) qs.set('before', String(pageParam));
      return api.get<T[]>(`${path}?${qs}`, signal);
    },
    getNextPageParam: (last) => (last.length === pageSize ? last.at(-1)?.id : undefined),
  });
}

export const useActivityFeed = (filter: { projectId?: number }, pageSize = 15) =>
  usePagedList<ActivityDto>(
    ['activity'],
    '/activity',
    filter.projectId ? { projectId: String(filter.projectId) } : {},
    pageSize,
  );

/** 设了倒计时的议题（截止早的在前）。剩余时间由 useNow 按秒在前端计算，不需要反复请求。 */
export const useCountdowns = () =>
  useQuery({
    queryKey: ['countdowns'],
    queryFn: ({ signal }) => api.get<CountdownDto[]>('/countdowns', signal),
  });

/**
 * 写操作。成功后刷新所有数据（单用户本地应用，数据量小，全部刷新最简单可靠），
 * 失败时弹出错误提示。
 */
export function useAction<TArgs = void, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { success?: string | ((result: TResult) => string) } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await qc.invalidateQueries();
      const msg = typeof options.success === 'function' ? options.success(result) : options.success;
      if (msg) toast.success(msg);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : String(err));
    },
  });
}

/** 常用的任务操作。 */
export function useTaskActions() {
  const update = useAction(({ id, patch }: { id: number; patch: UpdateTaskInput }) =>
    api.patch<TaskViewDto>(`/tasks/${id}`, patch),
  );
  const create = useAction((input: CreateTaskInput) => api.post<TaskViewDto>('/tasks', input));
  const remove = useAction((id: number) => api.delete(`/tasks/${id}`), { success: '任务已删除' });
  return { update, create, remove };
}
