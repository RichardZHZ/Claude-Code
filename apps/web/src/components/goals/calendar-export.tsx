import { CalendarDays, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ICS_PATH = '/api/calendar.ics';

/** 把里程碑和课题截止日期导出到日历：下载文件，或复制订阅地址。 */
export function CalendarExport() {
  async function copyUrl() {
    const url = new URL(ICS_PATH, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success('订阅地址已复制', { description: '在日历应用里选择"添加订阅日历"并粘贴。' });
    } catch {
      toast.info(url, { description: '复制失败，请手动复制这个地址。' });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <CalendarDays />
          导出到日历
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>未完成的里程碑和课题截止日期</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={ICS_PATH} download="researchpilot.ics">
            <Download />
            下载 .ics 文件
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyUrl()}>
          <Copy />
          复制订阅地址（应用运行时自动更新）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
