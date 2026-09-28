import { useState, type FormEvent } from 'react';
import { BookOpen, ExternalLink, Link2, Plus, Search, Trash2 } from 'lucide-react';
import type { ResourceDto, ResourceOwnerType } from '@researchpilot/core/contracts';
import { EmptyHint } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAction, useResources, useZoteroSearch } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Owner = { ownerType: ResourceOwnerType; ownerId: number; ownerTitle: string };

/** 文献与链接：列出、添加链接、从 Zotero 搜索并关联。 */
export function ResourcesPanel({ ownerType, ownerId, ownerTitle }: Owner) {
  const resources = useResources(ownerType, ownerId);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const list = resources.data ?? [];
  const literature = list.filter((r) => r.kind === 'zotero');
  const links = list.filter((r) => r.kind !== 'zotero');

  return (
    <div className="flex flex-col gap-3" data-testid="resources-panel">
      {resources.isPending ? (
        <EmptyHint>加载中…</EmptyHint>
      ) : list.length === 0 ? (
        <EmptyHint>还没有关联文献或链接。</EmptyHint>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...literature, ...links].map((r) => (
            <ResourceRow key={r.id} resource={r} />
          ))}
        </ul>
      )}
      {adding && <LinkForm ownerType={ownerType} ownerId={ownerId} onDone={() => setAdding(false)} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setSearching(true)}>
          <BookOpen />从 Zotero 添加文献
        </Button>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Link2 />
            添加链接
          </Button>
        )}
      </div>
      <Dialog open={searching} onOpenChange={setSearching}>
        <DialogContent className="sm:max-w-2xl">
          {searching && (
            <ZoteroSearch
              ownerType={ownerType}
              ownerId={ownerId}
              ownerTitle={ownerTitle}
              linkedKeys={new Set(literature.map((r) => r.ref))}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResourceRow({ resource: r }: { resource: ResourceDto }) {
  const remove = useAction(() => api.delete(`/resources/${r.id}`), {
    success: r.kind === 'zotero' ? '已移除文献' : '已移除链接',
  });
  const meta = r.meta ?? {};
  const isLiterature = r.kind === 'zotero';

  return (
    <li
      className="group flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
      data-testid="resource-item"
    >
      {isLiterature ? (
        <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        {isLiterature ? (
          <>
            <p>
              <span className="text-muted-foreground">
                {meta.creators || '佚名'}
                {meta.year ? ` (${meta.year})` : ''}
              </span>{' '}
              {meta.title ?? r.label}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {meta.publication && <span>{meta.publication}</span>}
              <a
                href={`zotero://select/library/items/${r.ref}`}
                className="hover:text-foreground hover:underline"
              >
                在 Zotero 中打开
              </a>
              {meta.doi && (
                <a
                  href={`https://doi.org/${meta.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground hover:underline"
                >
                  DOI
                </a>
              )}
            </p>
          </>
        ) : r.kind === 'url' ? (
          <a
            href={r.ref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {r.label || r.ref}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span>{r.label ? `${r.label}：${r.ref}` : r.ref}</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`移除：${r.label ?? r.ref}`}
        onClick={() => {
          if (window.confirm(`移除"${r.label ?? r.ref}"？`)) remove.mutate();
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function LinkForm({
  ownerType,
  ownerId,
  onDone,
}: {
  ownerType: ResourceOwnerType;
  ownerId: number;
  onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const add = useAction(
    () =>
      api.post('/resources', {
        ownerType,
        ownerId,
        kind: 'url',
        ref: url.trim(),
        label: label.trim() || undefined,
      }),
    { success: '链接已添加' },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row">
      <Input
        aria-label="链接名称"
        placeholder="名称，例如 Overleaf 初稿"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="sm:w-48"
      />
      <Input
        aria-label="链接地址"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="sm:flex-1"
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!url.trim() || add.isPending}>
          <Plus />
          添加
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          取消
        </Button>
      </div>
    </form>
  );
}

function ZoteroSearch({ ownerType, ownerId, ownerTitle, linkedKeys }: Owner & { linkedKeys: Set<string> }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const results = useZoteroSearch(query);
  const link = useAction(
    (itemKey: string) => api.post('/resources/zotero', { ownerType, ownerId, itemKey }),
    { success: '文献已关联' },
  );

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>从 Zotero 添加文献</DialogTitle>
        <DialogDescription>关联到"{ownerTitle}"。需要 Zotero 7 正在运行。</DialogDescription>
      </DialogHeader>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
      >
        <Input
          aria-label="搜索 Zotero"
          placeholder="作者、标题关键词或年份"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={!input.trim()}>
          <Search />
          搜索
        </Button>
      </form>
      <div className="max-h-[50vh] overflow-y-auto" data-testid="zotero-results">
        {!query ? (
          <EmptyHint>输入关键词后回车搜索。</EmptyHint>
        ) : results.isFetching && !results.data ? (
          <EmptyHint>搜索中…</EmptyHint>
        ) : results.isError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            {results.error.message}
          </p>
        ) : (results.data ?? []).length === 0 ? (
          <EmptyHint>没有找到匹配的文献。</EmptyHint>
        ) : (
          <ul className="flex flex-col divide-y">
            {(results.data ?? []).map((item) => {
              const linked = linkedKeys.has(item.key);
              return (
                <li key={item.key} className="flex items-start gap-3 py-2" data-testid="zotero-item">
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">
                        {item.creators || '佚名'}
                        {item.year ? ` (${item.year})` : ''}
                      </span>{' '}
                      {item.title}
                    </p>
                    {item.publication && <p className="text-xs text-muted-foreground">{item.publication}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant={linked ? 'ghost' : 'secondary'}
                    disabled={linked || link.isPending}
                    className={cn(linked && 'text-muted-foreground')}
                    aria-label={linked ? `已关联：${item.title}` : `关联：${item.title}`}
                    onClick={() => link.mutate(item.key)}
                  >
                    {linked ? '已关联' : '关联'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
