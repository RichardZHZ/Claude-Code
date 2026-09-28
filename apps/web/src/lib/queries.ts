import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateTaskInput,
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
