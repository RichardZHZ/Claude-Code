import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { CalendarMinus, CalendarPlus, ChevronLeft, ChevronRight, Star, StarOff } from 'lucide-react';
import { MAX_TOP_TASKS } from '@researchpilot/core/enums';
import type { DayViewDto, TaskViewDto } from '@researchpilot/core/contracts';
import { EmptyHint, Field, PageHeader, QueryView, Section } from '@/components/common';
import { TaskItem, TaskList } from '@/components/tasks/task-item';
import { TaskQuickAdd } from '@/components/tasks/task-quick-add';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { longDate, monthDay, timeOfDay, todayString } from '@/lib/format';
import { useAction, useDay, useTaskActions } from '@/lib/queries';

export function TodayPage() {
  const { d } = useSearch({ from: '/today' });
  const [today] = useState(todayString);
  const date = d ?? today;
  const day = useDay(date);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={date === today ? `今日 · ${longDate(date)}` : longDate(date)}
        subtitle={
          <Link to="/week" search={{ w: day.data?.weekKey }} className="hover:underline">
            {day.data?.weekKey ?? ' '}
          </Link>
        }
        actions={
          <>
            <Button variant="outline" size="icon" asChild>
              <Link to="/today" search={{ d: day.data?.prevDate }} aria-label="前一天">
                <ChevronLeft />
              </Link>
            </Button>
            {date !== today && (
              <Button variant="outline" asChild>
                <Link to="/today" search={{}}>
                  回到今天
                </Link>
              </Button>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link to="/today" search={{ d: day.data?.nextDate }} aria-label="后一天">
                <ChevronRight />
              </Link>
            </Button>
          </>
        }
      />
      <QueryView query={day}>{(data) => <DayContent key={date} data={data} />}</QueryView>
    </div>
  );
}

function DayContent({ data }: { data: DayViewDto }) {
  const { date } = data;
  const { update } = useTaskActions();
  const topIds = data.plan.topTaskIds;
  const topFull = topIds.length >= MAX_TOP_TASKS;

  const setTop = useAction((ids: number[]) => api.put(`/days/${date}/plan`, { topTaskIds: ids }));
  const pullAll = useAction(
    (tasks: TaskViewDto[]) =>
      Promise.all(tasks.map((t) => api.patch(`/tasks/${t.id}`, { scheduledDate: date }))),
    { success: (r) => `已把 ${r.length} 项任务接到今天` },
  );

  const starButton = (task: TaskViewDto) =>
    task.status !== 'done' && (
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={topFull || setTop.isPending}
        title={topFull ? `最多 ${MAX_TOP_TASKS} 件` : '设为今天最重要的事'}
        aria-label={`设为重点：${task.title}`}
        onClick={() => setTop.mutate([...topIds, task.id])}
      >
        <Star />
      </Button>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-6">
        <Section
          title={`最重要的 ${MAX_TOP_TASKS} 件事`}
          description="先做完这几件，今天就算成功。"
          testId="top-tasks"
        >
          {data.topTasks.length === 0 ? (
            <EmptyHint>从下面的安排或本周任务池里，点 ☆ 挑出今天最重要的 1–3 件事。</EmptyHint>
          ) : (
            <TaskList>
              {data.topTasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  actions={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="取消重点"
                      aria-label={`取消重点：${t.title}`}
                      onClick={() => setTop.mutate(topIds.filter((id) => id !== t.id))}
                    >
                      <StarOff />
                    </Button>
                  }
                />
              ))}
            </TaskList>
          )}
        </Section>

        <Section title="今天的其他安排" testId="scheduled-tasks">
          <div className="flex flex-col gap-3">
            {data.scheduled.length > 0 ? (
              <TaskList>
                {data.scheduled.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    actions={
                      <>
                        {starButton(t)}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="移出今天（留在本周）"
                          aria-label={`移出今天：${t.title}`}
                          onClick={() => update.mutate({ id: t.id, patch: { scheduledDate: null } })}
                        >
                          <CalendarMinus />
                        </Button>
                      </>
                    }
                  />
                ))}
              </TaskList>
            ) : (
              <EmptyHint>今天还没有别的安排。</EmptyHint>
            )}
            <TaskQuickAdd scheduledDate={date} placeholder="给今天加一项任务…" label="今天的新任务" />
          </div>
        </Section>

        {data.carryOver.length > 0 && (
          <Section
            title="待接手"
            description="之前排了但还没做完的任务。"
            testId="carry-over"
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={pullAll.isPending}
                onClick={() => pullAll.mutate(data.carryOver)}
              >
                全部接到今天
              </Button>
            }
          >
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
                      aria-label={`接到今天：${t.title}`}
                      onClick={() => update.mutate({ id: t.id, patch: { scheduledDate: date } })}
                    >
                      接到今天
                    </Button>
                  }
                />
              ))}
            </TaskList>
          </Section>
        )}

        <Section title="本周任务池" description="本周要做、但还没定哪天做的任务。" testId="week-pool">
          {data.weekPool.length === 0 ? (
            <EmptyHint>
              本周任务池是空的。去
              <Link to="/week" search={{ w: data.weekKey }} className="mx-1 underline">
                本周
              </Link>
              从待办池挑任务进来。
            </EmptyHint>
          ) : (
            <TaskList>
              {data.weekPool.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  actions={
                    <>
                      {starButton(t)}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="排到今天"
                        aria-label={`排到今天：${t.title}`}
                        onClick={() => update.mutate({ id: t.id, patch: { scheduledDate: date } })}
                      >
                        <CalendarPlus />
                      </Button>
                    </>
                  }
                />
              ))}
            </TaskList>
          )}
        </Section>
      </div>

      <div className="flex flex-col gap-6">
        <JournalCard date={date} saved={data.plan.journal ?? ''} />
        <ReviewCard data={data} />
      </div>
    </div>
  );
}

function JournalCard({ date, saved }: { date: string; saved: string }) {
  const [text, setText] = useState(saved);
  const save = useAction((journal: string) => api.put(`/days/${date}/plan`, { journal }), {
    success: '日志已保存',
  });
  const dirty = text !== saved;

  return (
    <Section title="工作日志" description="做了什么、想到什么，随手记。">
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="工作日志"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="10:30 跑完回归，系数方向和预期一致……"
        />
        <Button
          className="self-end"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(text)}
        >
          {dirty ? '保存日志' : '已保存'}
        </Button>
      </div>
    </Section>
  );
}

function ReviewCard({ data }: { data: DayViewDto }) {
  const review = data.plan.review;
  // 还没复盘时，用今天完成的任务预填"完成了什么"。
  const doneToday = [...data.topTasks, ...data.scheduled]
    .filter((t) => t.status === 'done')
    .map((t) => t.title);
  const [done, setDone] = useState(review?.done ?? doneToday.join('\n'));
  const [blockers, setBlockers] = useState(review?.blockers ?? '');
  const [tomorrow, setTomorrow] = useState(review?.tomorrow ?? '');
  const save = useAction(() => api.put(`/days/${data.date}/review`, { done, blockers, tomorrow }), {
    success: '复盘已保存',
  });

  return (
    <Section
      title="晚间复盘"
      description={
        data.plan.reviewedAt
          ? `已于 ${timeOfDay(data.plan.reviewedAt)} 复盘`
          : `${monthDay(data.date)}还没有复盘`
      }
      testId="day-review"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="今天完成了什么" htmlFor="review-done">
          <Textarea id="review-done" value={done} onChange={(e) => setDone(e.target.value)} rows={3} />
        </Field>
        <Field label="遇到的阻碍" htmlFor="review-blockers">
          <Textarea
            id="review-blockers"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="明天先做什么" htmlFor="review-tomorrow">
          <Textarea
            id="review-tomorrow"
            value={tomorrow}
            onChange={(e) => setTomorrow(e.target.value)}
            rows={2}
          />
        </Field>
        <Button type="submit" size="sm" className="self-end" disabled={save.isPending}>
          保存复盘
        </Button>
      </form>
    </Section>
  );
}
