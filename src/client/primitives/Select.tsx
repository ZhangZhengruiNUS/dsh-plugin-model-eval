import * as React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  selectedDescription?: string;
  searchText?: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  /** Optional business retry when confirming the unchanged value. */
  onReselect?(value: string): void;
  disabled?: boolean;
  placeholder?: string;
  showLabel?: boolean;
  className?: string;
  id?: string;
  'aria-describedby'?: string;
}

type PopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

function revealOption(layer: HTMLDivElement | null, activeIndex: number) {
  const option = layer?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
  if (!layer || !option) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  const minScroll = Math.min(top, bottom - layer.clientHeight);
  const nextScroll = Math.max(minScroll, Math.min(layer.scrollTop, top));
  if (nextScroll !== layer.scrollTop) layer.scrollTop = nextScroll;
}

/** Select-only combobox. Import controls.css within a data-dsh-ui theme root. */
export function Select({label, value, options, onChange, onReselect, disabled = false,
  placeholder = '请选择', showLabel = true, className, id, 'aria-describedby': describedBy}: SelectProps) {
  const generated = React.useId();
  const controlId = id ?? `dsh-select-${generated}`;
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const popup = React.useRef<HTMLDivElement>(null);
  const listbox = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [activeValue, setActiveValue] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<React.CSSProperties>();
  const search = React.useRef({text: '', at: 0});
  const selected = options.find(option => option.value === value);
  const enabled = options.filter(option => !option.disabled);
  // Derive from the current options so a removed/reordered item never leaves a stale ARIA id.
  const active = enabled.find(option => option.value === activeValue)
    ?? enabled.find(option => option.value === value) ?? enabled[0];
  const activeIndex = active ? options.indexOf(active) : -1;
  const latest = React.useRef({options, value, onChange, onReselect, disabled});
  latest.current = {options, value, onChange, onReselect, disabled};

  function isDisabled() {
    return latest.current.disabled || !latest.current.options.length
      || !trigger.current || trigger.current.matches(':disabled');
  }
  function close() {
    setOpen(false);
    search.current = {text: '', at: 0};
  }
  function show(option?: SelectOption) {
    if (isDisabled()) return;
    setActiveValue((option ?? enabled.find(item => item.value === value) ?? enabled[0])?.value ?? null);
    setPosition(undefined);
    setOpen(true);
  }
  function commit(nextValue: string | undefined) {
    const current = latest.current;
    const option = current.options.find(item => item.value === nextValue && !item.disabled);
    close();
    if (!isDisabled() && option) {
      if (option.value !== current.value) current.onChange(option.value);
      else current.onReselect?.(option.value);
    }
  }

  React.useEffect(() => { if (disabled || !options.length) close(); }, [disabled, options.length]);

  React.useLayoutEffect(() => {
    if (!open || !root.current || !trigger.current || !popup.current || !listbox.current) return;
    const scrollArea = listbox.current;
    const container = root.current, button = trigger.current, layer = popup.current as PopoverElement;
    const doc = button.ownerDocument, win = doc.defaultView;
    if (!win) return;
    let native = false;
    if (typeof layer.showPopover === 'function') {
      try {
        layer.setAttribute('popover', 'manual');
        layer.showPopover();
        native = true;
      } catch { layer.removeAttribute('popover'); }
    }
    const ancestors: HTMLElement[] = [];
    for (let element = container.parentElement; element; element = element.parentElement) ancestors.push(element);
    const dialog = container.closest('dialog, [role="dialog"], [role="alertdialog"]');
    const viewport = win.visualViewport;
    const place = () => {
      if (button.matches(':disabled')) { close(); return; }
      const anchor = button.getBoundingClientRect();
      let left = (viewport?.offsetLeft ?? 0) + 12;
      let top = (viewport?.offsetTop ?? 0) + 12;
      let right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? doc.documentElement.clientWidth) - 12;
      let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight) - 12;
      for (const element of ancestors) {
        const style = win.getComputedStyle(element);
        const isDialog = element === dialog;
        const clipX = isDialog || /auto|scroll|hidden|clip/.test(style.overflowX);
        const clipY = isDialog || /auto|scroll|hidden|clip/.test(style.overflowY);
        if (!clipX && !clipY) continue;
        const rect = element.getBoundingClientRect();
        if (clipX) { left = Math.max(left, rect.left + element.clientLeft); right = Math.min(right, rect.left + element.clientLeft + element.clientWidth); }
        if (clipY) { top = Math.max(top, rect.top + element.clientTop); bottom = Math.min(bottom, rect.top + element.clientTop + element.clientHeight); }
        // A viewport-level dialog can extend outside the host pane that owns its DOM.
        if (isDialog) break;
      }
      if (right <= left || bottom <= top || anchor.bottom <= top || anchor.top >= bottom
        || anchor.right <= left || anchor.left >= right || !anchor.width || !anchor.height) { close(); return; }
      const below = Math.max(0, bottom - anchor.bottom - 6);
      const above = Math.max(0, anchor.top - top - 6);
      const frameHeight = layer.offsetHeight - scrollArea.offsetHeight;
      const desired = Math.min(320, (scrollArea.scrollHeight || 320) + frameHeight);
      const up = below < desired && above > below;
      const height = Math.min(320, up ? above : below);
      if (height < 1) { close(); return; }
      const width = Math.min(anchor.width, right - left);
      const x = Math.max(left, Math.min(anchor.left, right - width));
      const origin = native ? {left: 0, top: 0} : container.getBoundingClientRect();
      setPosition({position: native ? 'fixed' : 'absolute', left: x - origin.left,
        top: (up ? anchor.top - 6 : anchor.bottom + 6) - origin.top,
        width, maxHeight: height, transform: up ? 'translateY(-100%)' : 'none', visibility: 'visible'});
    };
    place();
    const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(place) : undefined;
    observer?.observe(button);
    observer?.observe(layer);
    ancestors.forEach(element => observer?.observe(element));
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(container)) close();
    };
    const scroll = (event: Event) => {
      if (!(event.target instanceof win.Node) || !layer.contains(event.target)) place();
    };
    // Transform-only dialog motion changes the trigger rect without a resize.
    const dialogMotionEnd = (event: Event) => {
      if (event.target === dialog) place();
    };
    // Fieldsets may become disabled without any React update to this component.
    const mutations = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => {
      if (button.matches(':disabled')) close();
    }) : undefined;
    ancestors.filter(element => element.tagName === 'FIELDSET').forEach(element => mutations?.observe(element, {attributes: true, attributeFilter: ['disabled']}));
    win.addEventListener('resize', place);
    doc.addEventListener('scroll', scroll, true);
    doc.addEventListener('pointerdown', outside);
    dialog?.addEventListener('animationend', dialogMotionEnd);
    dialog?.addEventListener('animationcancel', dialogMotionEnd);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      win.removeEventListener('resize', place);
      doc.removeEventListener('scroll', scroll, true);
      doc.removeEventListener('pointerdown', outside);
      dialog?.removeEventListener('animationend', dialogMotionEnd);
      dialog?.removeEventListener('animationcancel', dialogMotionEnd);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      if (native) { try { layer.hidePopover?.(); } catch { /* Already hidden or detached. */ } }
    };
  }, [open]);

  React.useLayoutEffect(() => {
    // Before placement the option's offset can still be relative to a dialog ancestor.
    if (!open || !position || activeIndex < 0) return;
    revealOption(listbox.current, activeIndex);
  }, [activeIndex, open, position]);

  function keyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing || isDisabled()) return;
    const key = event.key;
    if (key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (key === 'Tab') { if (open) commit(active?.value); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) { show(key === 'End' ? enabled[enabled.length - 1] : key === 'Home' ? enabled[0] : undefined); return; }
      if (key === 'Enter' || key === ' ') { commit(active?.value); return; }
      const index = active ? enabled.indexOf(active) : 0;
      const page = Math.max(1, Math.floor((listbox.current?.clientHeight ?? 320) / 44));
      const next = key === 'Home' ? 0 : key === 'End' ? enabled.length - 1
        : index + (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'PageDown' ? page : -page);
      const nextOption = enabled[Math.max(0, Math.min(enabled.length - 1, next))];
      if (nextOption && nextOption === active) revealOption(listbox.current, activeIndex);
      setActiveValue(nextOption?.value ?? null);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = now - search.current.at > 700 ? key : search.current.text + key;
      search.current = {text, at: now};
      const term = ([...text].every(character => character === text[0]) ? key : text).toLocaleLowerCase();
      const start = active ? enabled.indexOf(active) + (term.length === 1 ? 1 : 0) : 0;
      for (let offset = 0; offset < enabled.length; offset++) {
        const option = enabled[(start + offset) % enabled.length]!;
        const words = [option.label, option.description ?? '', option.searchText ?? '']
          .flatMap(part => [part, ...part.split(/[\/·\n]/)]);
        if (words.some(part => part.trim().toLocaleLowerCase().startsWith(term))) {
          if (open) setActiveValue(option.value); else show(option);
          break;
        }
      }
    }
  }

  return <div ref={root} className={['dsh-select', className].filter(Boolean).join(' ')}>
    <label id={`${controlId}-label`} htmlFor={controlId} className={showLabel ? 'dsh-select-label' : 'dsh-sr-only'}>{label}</label>
    <button ref={trigger} id={controlId} type="button" role="combobox" className={`dsh-select-trigger${open ? ' is-open' : ''}`}
      aria-labelledby={`${controlId}-label`} aria-describedby={describedBy} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={open ? `${controlId}-list` : undefined}
      aria-activedescendant={open && activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined}
      disabled={disabled || !options.length} onClick={() => open ? close() : show()} onKeyDown={keyboard} onBlur={close}>
      <span className="dsh-select-value">{selected ? <><strong>{selected.label}</strong>
        {(selected.selectedDescription ?? selected.description) && <small>{selected.selectedDescription ?? selected.description}</small>}</>
        : value ? <span className="dsh-select-unknown">{value}</span> : <span className="dsh-select-placeholder">{placeholder}</span>}</span>
      <svg className="dsh-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open && <div ref={popup} className="dsh-select-popup" style={position ?? {visibility: 'hidden'}}>
      <div ref={listbox} id={`${controlId}-list`} role="listbox" aria-labelledby={`${controlId}-label`} className="dsh-select-listbox"
        onMouseDown={event => {
          // A native scrollbar drag must keep DOM focus on the combobox.
          if (event.target === event.currentTarget) event.preventDefault();
        }}>
        {options.map((option, index) => <div key={option.value} id={`${controlId}-option-${index}`} data-index={index} data-value={option.value}
          role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          className={`dsh-select-option${activeIndex === index ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}${option.description ? ' is-rich' : ''}`}
          onPointerDown={event => event.preventDefault()} onPointerMove={() => { if (!option.disabled) setActiveValue(option.value); }}
          onClick={() => commit(option.value)}>
          <span className="dsh-select-option-text"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
          <svg className="dsh-select-check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
        </div>)}
      </div>
    </div>}
  </div>;
}
