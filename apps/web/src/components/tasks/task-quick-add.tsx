import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTaskActions } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { OwnerSelect } from './owner-select';
import { decodeOwner, useOwnerChoice, writeLastOwner } from '@/lib/owner';

/**
 * 快速添加任务。
 * - 传 owner（课题或议题）时归属固定，不显示归属选择。
 * - 否则让用户选择归属，并记住上次的选择。
 */
export function TaskQuickAdd({
  owner,
  weekKey,
  scheduledDate,
  milestoneId,
  placeholder = '添加任务…',
  label = '新任务标题',
  stacked = false,
}: {
  owner?: { projectId: number } | { themeId: number };
  weekKey?: string;
  scheduledDate?: string;
  milestoneId?: number;
  placeholder?: string;
  label?: string;
  /** 窄容器里上下排列。 */
  stacked?: boolean;
}) {
  const { create } = useTaskActions();
  const choice = useOwnerChoice();
  const [title, setTitle] = useState('');

  if (!owner && choice.loaded && !choice.hasOptions) {
    return (
      <p className="text-sm text-muted-foreground">
        还没有课题或议题。先去
        <Link to="/map" className="mx-1 underline">
          议题地图
        </Link>
        建一个，任务才有归属。
      </p>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      {
        title: trimmed,
        ...(owner ?? decodeOwner(choice.owner)),
        milestoneId: milestoneId ?? null,
        weekKey: weekKey ?? null,
        scheduledDate: scheduledDate ?? null,
      },
      {
        onSuccess: () => {
          setTitle('');
          if (!owner) writeLastOwner(choice.owner);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-2', !stacked && 'sm:flex-row')}>
      <Input
        aria-label={label}
        value={title}
        placeholder={placeholder}
        onChange={(e) => setTitle(e.target.value)}
        className={cn('bg-background', !stacked && 'sm:flex-1')}
      />
      {!owner && (
        <OwnerSelect
          aria-label="任务归属"
          value={choice.owner}
          onChange={choice.setOwner}
          className={cn(!stacked && 'sm:w-56')}
        />
      )}
      <Button
        type="submit"
        variant="secondary"
        disabled={create.isPending || !title.trim() || (!owner && !choice.owner)}
      >
        <Plus />
        添加
      </Button>
    </form>
  );
}
