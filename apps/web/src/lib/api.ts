export type Health = {
  ok: boolean;
  today: string;
  week: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 调用后端 JSON 接口。开发时 Vite 会把 /api 代理到本机的 API 服务。 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `请求失败（${res.status}）`);
  }
  return (await res.json()) as T;
}
