import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from '@researchpilot/core/enums';
import type { ProjectDetailDto, TaskStatus, TaskViewDto } from '@researchpilot/core/contracts';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useTaskActions } from '@/lib/queries';
import { OwnerSelect } from './owner-select';
import { decodeOwner, encodeOwner, type OwnerValue } from '@/lib/owner';

/** 编辑任务的全部字段。 */
export function TaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task: TaskViewDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update, remove } = useTaskActions();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [owner, setOwner] = useState<OwnerValue>(encodeOwner(task));
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ? String(task.milestoneId) : '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState(String(task.priority));
  const [weekKey, setWeekKey] = useState(task.weekKey ?? '');
  const [scheduledDate, setScheduledDate] = useState(task.scheduledDate ?? '');
  const [estimate, setEstimate] = useState(task.estimateMin ? String(task.estimateMin) : '');

  const { projectId } = decodeOwner(owner);
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: ({ signal }) => api.get<ProjectDetailDto>(`/projects/${projectId}`, signal),
    enabled: projectId !== null,
  });
  const milestones = projectId !== null ? (project.data?.milestones ?? []) : [];

  const currentLabel = task.projectTitle ?? (task.themeTitle ? `议题 · ${task.themeTitle}` : '');

  function submit(e: FormEvent) {
    e.preventDefault();
    const decoded = decodeOwner(owner);
    update.mutate(
      {
        id: task.id,
        patch: {
          title,
          notes,
          ...decoded,
          milestoneId: decoded.projectId && milestoneId ? Number(milestoneId) : null,
          status,
          priority: Number(priority),
          weekKey: weekKey || null,
          scheduledDate: scheduledDate || null,
          estimateMin: estimate ? Number(estimate) : null,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function onDelete() {
    if (!window.confirm(`确定删除任务"${task.title}"吗？`)) return;
    remove.mutate(task.id, { onSuccess: () => onOpenChange(false) });
  }

  const id = (name: string) => `task-${task.id}-${name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑任务</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="标题" htmlFor={id('title')}>
            <Input id={id('title')} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="归属" htmlFor={id('owner')}>
            <OwnerSelect
              id={id('owner')}
              value={owner}
              onChange={(v) => {
                setOwner(v);
                setMilestoneId('');
              }}
              current={{ value: encodeOwner(task), label: currentLabel }}
            />
          </Field>
          {projectId !== null && (
            <Field label="里程碑" htmlFor={id('milestone')}>
              <NativeSelect
                id={id('milestone')}
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
              >
                <option value="">不关联里程碑</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="状态" htmlFor={id('status')}>
              <NativeSelect
                id={id('status')}
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="优先级" htmlFor={id('priority')}>
              <NativeSelect
                id={id('priority')}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {([1, 2, 3] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="排入周" htmlFor={id('week')} hint="如 2026-W40；排了具体日期会自动确定周">
              <Input
                id={id('week')}
                type="week"
                value={weekKey}
                placeholder="2026-W40"
                onChange={(e) => setWeekKey(e.target.value)}
              />
            </Field>
            <Field label="具体日期" htmlFor={id('date')}>
              <Input
                id={id('date')}
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </Field>
            <Field label="预估（分钟）" htmlFor={id('estimate')}>
              <Input
                id={id('estimate')}
                type="number"
                min={1}
                max={1440}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="备注" htmlFor={id('notes')}>
            <Textarea id={id('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 />
              删除
            </Button>
            <Button type="submit" disabled={update.isPending || !owner}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
