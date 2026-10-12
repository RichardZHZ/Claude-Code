import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CLOSED_PROJECT_STATUSES } from '@researchpilot/core/enums';
import { PageHeader, QueryView } from '@/components/common';
import { CalendarExport } from '@/components/goals/calendar-export';
import { ProjectDialog } from '@/components/goals/project-dialog';
import { ThemeDialog } from '@/components/goals/theme-dialog';
import { ThemeBranch, UnassignedBranch } from '@/components/goals/theme-tree';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { todayString } from '@/lib/format';
import { useThemeMap } from '@/lib/queries';
import { useStoredState } from '@/lib/storage';

/**
 * 议题地图：一张树状图，议题 → 课题 → 里程碑。点议题进议题页（说明、探索任务、文献），
 * 点课题进课题页。已结束的议题和课题默认收起。
 */
export function MapPage() {
  const map = useThemeMap();
  const [today] = useState(todayString);
  const [showClosed, setShowClosed] = useStoredState('rp.map.showClosed', false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="议题地图"
        subtitle="议题 → 课题 → 里程碑。点议题看说明和探索任务，点课题进入课题页。"
        actions={
          <>
            <Button variant="ghost" aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? '隐藏已结束的' : '显示已结束的'}
            </Button>
            <CalendarExport />
            <ProjectDialog
              trigger={
                <Button variant="outline">
                  <Plus />
                  新建课题
                </Button>
              }
            />
            <ThemeDialog
              trigger={
                <Button>
                  <Plus />
                  新建议题
                </Button>
              }
            />
          </>
        }
      />
      <QueryView query={map}>
        {(data) => {
          if (data.themes.length === 0 && data.unassignedProjects.length === 0) {
            return (
              <Card className="items-center py-12 text-center">
                <CardContent className="flex flex-col items-center gap-3">
                  <p className="font-medium">从一个研究议题开始</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    议题是你长期关注的研究方向，例如"气候变化对农业的影响"。之后在议题下建立具体课题，再把课题拆成任务。
                  </p>
                  <ThemeDialog
                    trigger={
                      <Button>
                        <Plus />
                        新建第一个议题
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            );
          }
          const themes = showClosed ? data.themes : data.themes.filter((t) => t.status !== 'closed');
          const unassigned = showClosed
            ? data.unassignedProjects
            : data.unassignedProjects.filter((p) => !CLOSED_PROJECT_STATUSES.includes(p.status));
          const hiddenThemes = data.themes.length - themes.length;
          return (
            <Card className="py-6">
              <CardContent className="flex flex-col gap-8 overflow-x-auto px-6" data-testid="theme-tree">
                {themes.map((theme) => (
                  <ThemeBranch key={theme.id} theme={theme} today={today} showClosed={showClosed} />
                ))}
                {unassigned.length > 0 && <UnassignedBranch projects={unassigned} today={today} />}
                {hiddenThemes > 0 && (
                  <p className="text-sm text-muted-foreground">
                    另有 {hiddenThemes} 个已结束的议题，
                    <button type="button" className="underline" onClick={() => setShowClosed(true)}>
                      显示
                    </button>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        }}
      </QueryView>
    </div>
  );
}
