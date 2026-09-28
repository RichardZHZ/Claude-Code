import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** 页面里的一个区块。 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={cn('gap-4 py-5', className)} data-testid={testId}>
      <CardHeader className="px-5">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions && <CardAction className="flex items-center gap-1">{actions}</CardAction>}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

export function EmptyHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('py-2 text-sm text-muted-foreground', className)}>{children}</p>;
}

/** 统一处理加载中与出错，数据到了才渲染内容。 */
export function QueryView<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-sm">
        <p className="text-destructive">加载失败：{query.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          <RefreshCw />
          重试
        </Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

/** 表单里的一行：标签 + 控件。 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
