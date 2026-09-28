import * as React from 'react';
import { cn } from '@/lib/utils';

/** 进度条（0–100）。 */
function Progress({
  className,
  value,
  label,
  ...props
}: React.ComponentProps<'div'> & { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-primary/15', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export { Progress };
