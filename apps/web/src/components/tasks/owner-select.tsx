import type { ComponentProps } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import type { OwnerValue } from '@/lib/owner';
import { useOwners } from '@/lib/queries';

/**
 * 选择任务归属：课题或议题。
 * current 用于显示当前归属（即使它已结束、不在可选列表里）。
 */
export function OwnerSelect({
  value,
  onChange,
  current,
  placeholder = '选择课题或议题',
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange'> & {
  value: OwnerValue;
  onChange: (value: OwnerValue) => void;
  current?: { value: OwnerValue; label: string };
  placeholder?: string;
}) {
  const owners = useOwners();
  const projects = owners.data?.projects ?? [];
  const themes = owners.data?.themes ?? [];
  const known = new Set<string>([...projects.map((p) => `p:${p.id}`), ...themes.map((t) => `t:${t.id}`)]);
  const themeTitle = new Map(themes.map((t) => [t.id, t.title]));

  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value as OwnerValue)} {...props}>
      <option value="" disabled>
        {owners.isPending ? '加载中…' : placeholder}
      </option>
      {current && current.value && !known.has(current.value) && (
        <option value={current.value}>{current.label}</option>
      )}
      {projects.length > 0 && (
        <optgroup label="课题">
          {projects.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.title}
              {p.themeId && themeTitle.has(p.themeId) ? `（${themeTitle.get(p.themeId)}）` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {themes.length > 0 && (
        <optgroup label="议题（不属于具体课题的任务）">
          {themes.map((t) => (
            <option key={t.id} value={`t:${t.id}`}>
              {t.title}
            </option>
          ))}
        </optgroup>
      )}
    </NativeSelect>
  );
}
