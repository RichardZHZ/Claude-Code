import { useState, type FormEvent, type ReactNode } from 'react';
import {
  PRIORITY_LABELS,
  PROJECT_KINDS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from '@researchpilot/core/enums';
import type { ProjectDto, ProjectKind, ProjectStatus } from '@researchpilot/core/contracts';
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
import { useAction, useThemeMap } from '@/lib/queries';

/** 新建或编辑课题。传 project 为编辑；新建时可用 themeId 预选议题。 */
export function ProjectDialog({
  project,
  themeId,
  trigger,
  onCreated,
}: {
  project?: ProjectDto;
  themeId?: number | null;
  trigger: ReactNode;
  onCreated?: (project: ProjectDto) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {open && (
          <ProjectForm
            project={project}
            themeId={themeId}
            onDone={(p) => {
              setOpen(false);
              if (!project) onCreated?.(p);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  project,
  themeId,
  onDone,
}: {
  project?: ProjectDto;
  themeId?: number | null;
  onDone: (p: ProjectDto) => void;
}) {
  const themes = useThemeMap().data?.themes ?? [];
  const [title, setTitle] = useState(project?.title ?? '');
  const [theme, setTheme] = useState(String(project?.themeId ?? themeId ?? ''));
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'paper');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [priority, setPriority] = useState(String(project?.priority ?? 2));
  const [startedAt, setStartedAt] = useState(project?.startedAt ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [description, setDescription] = useState(project?.description ?? '');

  const save = useAction(
    () => {
      const body = {
        title,
        themeId: theme ? Number(theme) : null,
        kind,
        status,
        priority: Number(priority),
        startedAt: startedAt || null,
        deadline: deadline || null,
        description,
      };
      return project
        ? api.patch<ProjectDto>(`/projects/${project.id}`, body)
        : api.post<ProjectDto>('/projects', body);
    },
    { success: project ? '课题已更新' : '课题已创建' },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{project ? '编辑课题' : '新建课题'}</DialogTitle>
        <DialogDescription>有明确交付物的工作，例如一篇论文、一份基金申请、一章学位论文。</DialogDescription>
      </DialogHeader>
      <Field label="名称" htmlFor="project-title">
        <Input
          id="project-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <Field label="所属议题" htmlFor="project-theme">
        <NativeSelect id="project-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">不属于任何议题</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="类型" htmlFor="project-kind">
          <NativeSelect
            id="project-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
          >
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="状态" htmlFor="project-status">
          <NativeSelect
            id="project-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="优先级" htmlFor="project-priority">
          <NativeSelect id="project-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {([1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="开始日期" htmlFor="project-started">
          <Input
            id="project-started"
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </Field>
        <Field label="截止日期" htmlFor="project-deadline">
          <Input
            id="project-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
      </div>
      <Field label="说明" htmlFor="project-description">
        <Textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={save.isPending}>
          {project ? '保存' : '创建'}
        </Button>
      </DialogFooter>
    </form>
  );
}
