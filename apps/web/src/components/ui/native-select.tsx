import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 原生下拉框：在手机上使用系统选择器，也方便自动化测试。 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full', className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className="h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-background [&>optgroup]:bg-background"
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}

export { NativeSelect };
