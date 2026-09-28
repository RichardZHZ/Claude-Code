import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { HEALTH_THRESHOLDS as T } from '@researchpilot/core/health-rules';
import { IssueItem } from '@/components/checks/issue-item';
import { PageHeader, QueryView, Section } from '@/components/common';
import { todayString } from '@/lib/format';
import { useChecks } from '@/lib/queries';

const RULES = [
  {
    name: '里程碑有风险',
    text: `${T.milestoneWindowDays} 天内到期、但关联任务完成不到 ${T.milestoneMinPercent}%；已逾期的里程碑一律提醒。`,
  },
  { name: '课题停滞', text: `进行中的课题超过 ${T.staleDays} 天没有任何更新。` },
  { name: '周复盘', text: '上周有计划或任务却没写复盘；本周从周五起也会提醒。' },
  { name: '遗留任务', text: '课题或议题已经结束，下面还有没完成的任务。' },
  { name: '议题缺少课题', text: `进行中的议题下没有进行中的课题（新建 ${T.themeGraceDays} 天内不提醒）。` },
];

export function ChecksPage() {
  const [today] = useState(todayString);
  const checks = useChecks(today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="提醒" subtitle="按固定规则自动检查，解决了问题提醒就会消失。" />
      <QueryView query={checks}>
        {(data) =>
          data.issues.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 rounded-xl border py-12 text-center"
              data-testid="checks-empty"
            >
              <CheckCircle2 className="size-8 text-success" />
              <p className="font-medium">一切正常</p>
              <p className="text-sm text-muted-foreground">没有停滞的课题、逾期的里程碑或漏掉的复盘。</p>
            </div>
          ) : (
            <Section
              title={`${data.issues.length} 条提醒`}
              description={[
                data.counts.danger ? `${data.counts.danger} 条紧急` : '',
                data.counts.warning ? `${data.counts.warning} 条需要注意` : '',
                data.counts.info ? `${data.counts.info} 条提示` : '',
              ]
                .filter(Boolean)
                .join('，')}
              testId="checks-list"
            >
              <ul className="-mx-2 flex flex-col">
                {data.issues.map((issue) => (
                  <IssueItem key={issue.key} issue={issue} />
                ))}
              </ul>
            </Section>
          )
        }
      </QueryView>
      <Section title="检查规则" description='不想被提醒的课题，可以把状态设为"暂停"。'>
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
          {RULES.map((r) => (
            <div key={r.name} className="contents">
              <dt className="font-medium">{r.name}</dt>
              <dd className="text-muted-foreground">{r.text}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
