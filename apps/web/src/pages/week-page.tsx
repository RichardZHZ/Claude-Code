import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Undo2 } from 'lucide-react';
import { isoWeekKey } from '@researchpilot/core/week';
import { MAX_WEEK_FOCUS } from '@researchpilot/core/enums';
import type { TaskViewDto, WeekViewDto } from '@researchpilot/core/contracts';
import { EmptyHint, PageHeader, QueryView, Section } from '@/components/common';
import { CountdownCard } from '@/components/countdown/countdown-card';
import { FocusTimerCard } from '@/components/focus/focus-panel';
import { TaskItem, TaskList } from '@/components/tasks/task-item';
import { TaskQuickAdd } from '@/components/tasks/task-quick-add';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { dueInfo, linesToList, listToLines, todayString, weekRangeLabel } from '@/lib/format';
import { useAction, useTaskActions, useWeek } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function WeekPage() {
  const { w } = useSearch({ from: '/week' });
  const [today] = useState(todayString);
  const thisWeek = isoWeekKey(today);
  const weekKey = w ?? thisWeek;
  const week = useWeek(weekKey);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={weekKey === thisWeek ? `本周 · ${weekKey}` : weekKey}
        subtitle={weekRangeLabel(weekKey)}
        actions={
          <>
            <Button variant="outline" size="icon" asChild>
              <Link to="/week" search={{ w: week.data?.prevWeek }} aria-label="上一周">
                <ChevronLeft />
              </Link>
            </Button>
            {weekKey !== thisWeek && (
              <Button variant="outline" asChild>
                <Link to="/week" search={{}}>
                  回到本周
                </Link>
              </Button>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link to="/week" search={{ w: week.data?.nextWeek }} aria-label="下一周">
                <ChevronRight />
              </Link>
            </Button>
          </>
        }
      />
      <QueryView query={week}>
        {(data) => <WeekContent key={weekKey} data={data} today={today} isThisWeek={weekKey === thisWeek} />}
      </QueryView>
    </div>
  );
}

/** 按所属课题或议题分组，保持首次出现的顺序。 */
function groupByContext(tasks: TaskViewDto[]) {
  const groups = new Map<
    string,
    { key: string; label: string; projectId: number | null; tasks: TaskViewDto[] }
  >();
  for (const t of tasks) {
    const key = t.projectId ? `p${t.projectId}` : `t${t.themeId}`;
    const label = t.projectTitle ?? (t.themeTitle ? `议题 · ${t.themeTitle}` : '未知归属');
    const g = groups.get(key) ?? { key, label, projectId: t.projectId, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  return [...groups.values()];
}

const BACKLOG_PREVIEW = 12;

function WeekContent({ data, today, isThisWeek }: { data: WeekViewDto; today: string; isThisWeek: boolean }) {
  const { weekKey } = data;
  const { update } = useTaskActions();
  const [showAllBacklog, setShowAllBacklog] = useState(false);
  const groups = groupByContext(data.tasks);
  const backlog = showAllBacklog ? data.backlog : data.backlog.slice(0, BACKLOG_PREVIEW);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-6">
        <FocusCard weekKey={weekKey} focus={data.plan.focus} />

        {data.milestonesDue.length > 0 && (
          <Section title="本周到期的里程碑" description="包括已经逾期、还没完成的。" testId="milestones-due">
            <ul className="flex flex-col gap-2">
              {data.milestonesDue.map((m) => {
                const due = m.dueDate ? dueInfo(m.dueDate, today) : null;
                return (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      ◆ {m.title}
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: String(m.projectId) }}
                        className="ml-2 text-xs text-muted-foreground hover:underline"
                      >
                        {m.projectTitle}
                      </Link>
                    </span>
                    {due && (
                      <span
                        className={cn(
                          'text-xs',
                          due.tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {due.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section
          title="本周任务"
          description={`${data.tasks.filter((t) => t.status === 'done').length} / ${data.tasks.length} 已完成`}
          testId="week-tasks"
        >
          <div className="flex flex-col gap-4">
            {groups.length === 0 && <EmptyHint>本周还没有任务。从下面的待办池挑，或者直接添加。</EmptyHint>}
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                  {g.projectId ? (
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: String(g.projectId) }}
                      className="hover:underline"
                    >
                      {g.label}
                    </Link>
                  ) : (
                    g.label
                  )}
                </h3>
                <TaskList>
                  {g.tasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      showContext={false}
                      showSchedule
                      actions={
                        <>
                          {isThisWeek && t.status !== 'done' && t.scheduledDate !== today && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title="排到今天"
                              aria-label={`排到今天：${t.title}`}
                              onClick={() => update.mutate({ id: t.id, patch: { scheduledDate: today } })}
                            >
                              <CalendarPlus />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="移出本周（放回待办池）"
                            aria-label={`移出本周：${t.title}`}
                            onClick={() => update.mutate({ id: t.id, patch: { weekKey: null } })}
                          >
                            <Undo2 />
                          </Button>
                        </>
                      }
                    />
                  ))}
                </TaskList>
              </div>
            ))}
            <TaskQuickAdd weekKey={weekKey} placeholder="给本周加一项任务…" label="本周的新任务" />
          </div>
        </Section>

        {data.carryOver.length > 0 && (
          <Section title="待接手" description="之前几周排了但还没做完的任务。" testId="week-carry-over">
            <TaskList>
              {data.carryOver.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  showSchedule
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`移到本周：${t.title}`}
                      onClick={() => update.mutate({ id: t.id, patch: { weekKey } })}
                    >
                      移到本周
                    </Button>
                  }
                />
              ))}
            </TaskList>
          </Section>
        )}

        <Section title="待办池" description="还没排进任何一周的任务。" testId="backlog">
          {data.backlog.length === 0 ? (
            <EmptyHint>待办池是空的。在课题页或议题地图里添加任务，它们会先出现在这里。</EmptyHint>
          ) : (
            <>
              <TaskList>
                {backlog.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`加入本周：${t.title}`}
                        onClick={() => update.mutate({ id: t.id, patch: { weekKey } })}
                      >
                        加入本周
                      </Button>
                    }
                  />
                ))}
              </TaskList>
              {data.backlog.length > BACKLOG_PREVIEW && (
                <Button
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() => setShowAllBacklog((v) => !v)}
                >
                  {showAllBacklog ? '收起' : `显示全部 ${data.backlog.length} 项`}
                </Button>
              )}
            </>
          )}
        </Section>
      </div>

      <div className="flex flex-col gap-6">
        <CountdownCard />
        <FocusTimerCard today={todayString()} />
        <WeekProgressCard data={data} />
      </div>
    </div>
  );
}

function FocusCard({ weekKey, focus }: { weekKey: string; focus: string[] }) {
  const [editing, setEditing] = useState(focus.length === 0);
  const [text, setText] = useState(listToLines(focus));
  const save = useAction(() => api.put(`/weeks/${weekKey}/plan`, { focus: linesToList(text) }), {
    success: '本周重点已保存',
  });

  return (
    <Section
      title="本周重点"
      description={`这周最想推进的 ${MAX_WEEK_FOCUS} 件以内的事。`}
      testId="week-focus"
      actions={
        !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="编辑本周重点"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )
      }
    >
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined, { onSuccess: () => setEditing(false) });
          }}
        >
          <Textarea
            aria-label="本周重点"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={'每行一条，例如：\n完成论文主要分析\n读完两篇相关综述'}
          />
          <div className="flex justify-end gap-2">
            {focus.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText(listToLines(focus));
                  setEditing(false);
                }}
              >
                取消
              </Button>
            )}
            <Button type="submit" size="sm" disabled={save.isPending}>
              保存重点
            </Button>
          </div>
        </form>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {focus.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** 本周完成度和本周新关联的文献。 */
function WeekProgressCard({ data }: { data: WeekViewDto }) {
  const done = data.tasks.filter((t) => t.status === 'done').length;
  const total = data.tasks.length;
  return (
    <Section title="本周进度" testId="week-progress">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>本周任务完成</span>
          <span>
            {done} / {total}
          </span>
        </div>
        <Progress value={total ? (done / total) * 100 : 0} label="本周任务完成度" />
      </div>
      {data.literature.length > 0 && (
        <div className="mt-4" data-testid="week-literature">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            本周关联的文献（{data.literature.length}）
          </p>
          <ul className="space-y-0.5 text-sm">
            {data.literature.map((r) => (
              <li key={r.id} className="truncate" title={r.label ?? r.ref}>
                {r.label ?? r.ref}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
