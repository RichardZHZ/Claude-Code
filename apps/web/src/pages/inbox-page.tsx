import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { isoWeekKey } from '@researchpilot/core/week';
import type { InboxItemDto, PromoteResultDto, PromoteType } from '@researchpilot/core/contracts';
import { EmptyHint, Field, PageHeader, QueryView, Section } from '@/components/common';
import { OwnerSelect } from '@/components/tasks/owner-select';
import { decodeOwner, useOwnerChoice, writeLastOwner } from '@/lib/owner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { dateTimeLabel, todayString } from '@/lib/format';
import { useAction, useInbox, useOwners } from '@/lib/queries';

const TYPE_LABELS: Record<PromoteType, string> = { task: '任务', project: '课题', theme: '议题' };

export function InboxPage() {
  const inbox = useInbox();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="收件箱" subtitle="先记下来，再决定它是一项任务、一个课题，还是一个新的研究议题。" />
      <CaptureCard />
      <QueryView query={inbox}>
        {(data) => (
          <>
            <Section title={`待处理（${data.pending.length}）`} testId="inbox-pending">
              {data.pending.length === 0 ? (
                <EmptyHint>收件箱是空的。</EmptyHint>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.pending.map((item) => (
                    <PendingItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Section>
            {data.processed.length > 0 && (
              <Section title="最近处理过的" testId="inbox-processed">
                <ul className="flex flex-col gap-1.5 text-sm">
                  {data.processed.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-baseline gap-2 text-muted-foreground">
                      <span className="line-through">{item.content.split('\n')[0]}</span>
                      <span className="text-xs">
                        → 已转为{item.promotedType ? TYPE_LABELS[item.promotedType] : ''}
                        {item.promotedType === 'project' && item.promotedId && (
                          <Link
                            to="/projects/$projectId"
                            params={{ projectId: String(item.promotedId) }}
                            className="ml-1 underline"
                          >
                            查看
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}

function CaptureCard() {
  const [content, setContent] = useState('');
  const add = useAction(() => api.post('/inbox', { content }), { success: '已记下' });

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!content.trim()) return;
    add.mutate(undefined, { onSuccess: () => setContent('') });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        aria-label="新记录"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={3}
        placeholder="一个想法、一篇要读的文章、一件要做的事……（Ctrl/⌘ + Enter 记下）"
      />
      <Button type="submit" className="self-end" disabled={!content.trim() || add.isPending}>
        记下
      </Button>
    </form>
  );
}

function PendingItem({ item }: { item: InboxItemDto }) {
  const [promoting, setPromoting] = useState<PromoteType | null>(null);
  const remove = useAction(() => api.delete(`/inbox/${item.id}`), { success: '已删除' });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start" data-testid="inbox-item">
      <div className="min-w-0 flex-1">
        <p className="text-sm whitespace-pre-wrap">{item.content}</p>
        <p className="mt-1 text-xs text-muted-foreground">{dateTimeLabel(item.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {(['task', 'project', 'theme'] as const).map((type) => (
          <Button key={type} variant="outline" size="sm" onClick={() => setPromoting(type)}>
            转为{TYPE_LABELS[type]}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="删除这条记录"
          onClick={() => {
            if (window.confirm('删除这条记录？')) remove.mutate();
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <Dialog open={promoting !== null} onOpenChange={(open) => !open && setPromoting(null)}>
        <DialogContent>
          {promoting && <PromoteForm item={item} type={promoting} onDone={() => setPromoting(null)} />}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function PromoteForm({ item, type, onDone }: { item: InboxItemDto; type: PromoteType; onDone: () => void }) {
  const owners = useOwners();
  const [title, setTitle] = useState((item.content.split('\n')[0] ?? '').trim().slice(0, 200));
  const { owner, setOwner } = useOwnerChoice();
  const [thisWeek, setThisWeek] = useState(true);
  const [themeId, setThemeId] = useState('');

  const promote = useAction(
    () => {
      const base = { type, title };
      const body =
        type === 'task'
          ? { ...base, ...decodeOwner(owner), weekKey: thisWeek ? isoWeekKey(todayString()) : null }
          : type === 'project'
            ? { ...base, themeId: themeId ? Number(themeId) : null }
            : base;
      return api.post<PromoteResultDto>(`/inbox/${item.id}/promote`, body);
    },
    { success: `已转为${TYPE_LABELS[type]}` },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    promote.mutate(undefined, {
      onSuccess: () => {
        if (type === 'task') writeLastOwner(owner);
        onDone();
      },
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>转为{TYPE_LABELS[type]}</DialogTitle>
        <DialogDescription>原文会保存在{type === 'task' ? '任务备注' : '说明'}里。</DialogDescription>
      </DialogHeader>
      <Field label="标题" htmlFor="promote-title">
        <Input id="promote-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      {type === 'task' && (
        <>
          <Field label="归属" htmlFor="promote-owner">
            <OwnerSelect id="promote-owner" value={owner} onChange={setOwner} />
          </Field>
          <Label className="font-normal">
            <Checkbox checked={thisWeek} onCheckedChange={(v) => setThisWeek(v === true)} />
            排进本周
          </Label>
        </>
      )}
      {type === 'project' && (
        <Field label="所属议题" htmlFor="promote-theme">
          <NativeSelect id="promote-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">不属于任何议题</option>
            {(owners.data?.themes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <DialogFooter>
        <Button type="submit" disabled={promote.isPending || !title.trim() || (type === 'task' && !owner)}>
          确定
        </Button>
      </DialogFooter>
    </form>
  );
}
