import { useState, type FormEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { THEME_STATUSES, THEME_STATUS_LABELS } from '@researchpilot/core/enums';
import type { ThemeDto, ThemeStatus } from '@researchpilot/core/contracts';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { linesToList, listToLines } from '@/lib/format';
import { useAction } from '@/lib/queries';

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 时刻 → datetime-local 输入框用的本机时间 'YYYY-MM-DDTHH:mm:ss'。 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 新建或编辑研究议题。传 theme 为编辑，不传为新建。 */
export function ThemeDialog({ theme, trigger }: { theme?: ThemeDto; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>{open && <ThemeForm theme={theme} onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  );
}

function ThemeForm({ theme, onDone }: { theme?: ThemeDto; onDone: () => void }) {
  const [title, setTitle] = useState(theme?.title ?? '');
  const [description, setDescription] = useState(theme?.description ?? '');
  const [questions, setQuestions] = useState(listToLines(theme?.coreQuestions ?? []));
  const [status, setStatus] = useState<ThemeStatus>(theme?.status ?? 'active');
  const [startedAt, setStartedAt] = useState(theme?.startedAt ?? '');
  const [countdown, setCountdown] = useState(theme?.countdownAt ? toLocalInput(theme.countdownAt) : '');

  const save = useAction(
    () => {
      const body = {
        title,
        description,
        coreQuestions: linesToList(questions),
        status,
        startedAt: startedAt || null,
        // datetime-local 没有时区，按本机时间理解，再转成带时区的时刻。
        countdownAt: countdown ? new Date(countdown).toISOString() : null,
      };
      return theme ? api.patch<ThemeDto>(`/themes/${theme.id}`, body) : api.post<ThemeDto>('/themes', body);
    },
    { success: theme ? '议题已更新' : '议题已创建' },
  );
  const remove = useAction(() => api.delete(`/themes/${theme?.id}`), { success: '议题已删除' });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: onDone });
  }

  function onDelete() {
    if (
      !window.confirm(
        `确定删除议题"${theme?.title}"吗？\n其下的课题会保留（变为未归属议题），直接挂在议题下的任务会被删除。`,
      )
    )
      return;
    remove.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{theme ? '编辑研究议题' : '新建研究议题'}</DialogTitle>
        <DialogDescription>长期、开放式的研究方向，下面可以有多个具体课题。</DialogDescription>
      </DialogHeader>
      <Field label="名称" htmlFor="theme-title">
        <Input id="theme-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </Field>
      <Field label="说明" htmlFor="theme-description">
        <Textarea
          id="theme-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="为什么这个方向重要？"
          rows={2}
        />
      </Field>
      <Field label="核心问题" htmlFor="theme-questions" hint="每行一个问题">
        <Textarea
          id="theme-questions"
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder="这个议题想回答的大问题"
          rows={3}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="状态" htmlFor="theme-status">
          <NativeSelect
            id="theme-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ThemeStatus)}
          >
            {THEME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {THEME_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="开始日期" htmlFor="theme-started">
          <Input
            id="theme-started"
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="倒计时截止"
        htmlFor="theme-countdown"
        hint="例如答辩、基金截止。设了以后，今日页、本周页和桌面小窗会按秒倒计时。留空表示不倒计时。"
      >
        <div className="flex gap-2">
          <Input
            id="theme-countdown"
            type="datetime-local"
            step={1}
            value={countdown}
            onChange={(e) => setCountdown(e.target.value)}
          />
          {countdown && (
            <Button type="button" variant="ghost" onClick={() => setCountdown('')}>
              清除
            </Button>
          )}
        </div>
      </Field>
      <DialogFooter className={theme ? 'sm:justify-between' : undefined}>
        {theme && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 />
            删除议题
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          {theme ? '保存' : '创建'}
        </Button>
      </DialogFooter>
    </form>
  );
}
