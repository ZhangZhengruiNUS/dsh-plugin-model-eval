import * as React from 'react';

interface Category<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  categories: readonly Category<T>[];
  active: T;
  panelId: string;
  onChange(category: T): void;
  actions: React.ReactNode;
}

export function ComparisonToolbar<T extends string>({
  label, categories, active, panelId, onChange, actions,
}: Props<T>) {
  function move(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = categories.length;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index + count - 1) % count; break;
      case 'ArrowRight': next = (index + 1) % count; break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    const tab = event.currentTarget.parentElement?.querySelectorAll('button')[next];
    tab?.focus({preventScroll: true});
    onChange(categories[next]!.id);
  }

  function reveal(event: React.FocusEvent<HTMLButtonElement>) {
    const tab = event.currentTarget;
    const strip = tab.parentElement!;
    const viewport = strip.getBoundingClientRect();
    const bounds = tab.getBoundingClientRect();
    if (bounds.left < viewport.left) strip.scrollBy({left: bounds.left - viewport.left});
    if (bounds.right > viewport.right) strip.scrollBy({left: bounds.right - viewport.right});
  }

  return <div className="me-comparison-toolbar">
    <div className="me-comparison-category-tabs" role="tablist" aria-label={label}>
      {categories.map(({id, label}, index) => <button key={id} type="button" role="tab"
        id={`${panelId}-${id}`} aria-controls={panelId} aria-selected={id === active}
        tabIndex={id === active ? 0 : -1} onClick={() => onChange(id)}
        onKeyDown={event => move(event, index)} onFocus={reveal}>{label}</button>)}
    </div>
    <div className="me-inline-actions me-comparison-actions">{actions}</div>
  </div>;
}
