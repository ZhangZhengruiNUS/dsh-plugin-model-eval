import * as React from 'react';
import {zh as t} from '../locales.ts';
import {Icon} from '../ui.tsx';

const destinations = ['compare', 'jobs', 'history'] as const;
type PrimaryDestination = typeof destinations[number];
export type WorkbenchView = PrimaryDestination | 'settings';

export function WorkbenchNav({view, hasActiveJob, onNavigate}: {
  view: WorkbenchView;
  hasActiveJob: boolean;
  onNavigate: (view: WorkbenchView) => void;
}) {
  const lastPrimary = React.useRef<PrimaryDestination>('compare');
  const glass = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    if (view === 'settings' || lastPrimary.current === view) return;
    lastPrimary.current = view;
    const element = glass.current;
    const motion = element?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
    if (!element?.animate || !motion || motion.matches) return;
    const stretch = element.animate([
      {scale:'1'}, {scale:'1.085 .94',offset:.32}, {scale:'1'},
    ], {duration:280,easing:'ease-out'});
    const stop = () => stretch.cancel();
    motion.addEventListener('change',stop);
    return () => {stop();motion.removeEventListener('change',stop);};
  }, [view]);
  const index = destinations.indexOf(view === 'settings' ? lastPrimary.current : view);

  return <nav className="me-workbench-nav" aria-label={t.brand}>
    <div className="me-workbench-dock" data-dsh-local-light="" data-utility-active={view === 'settings'}
      style={{'--me-dock-index': index} as React.CSSProperties}>
      <span className="me-dock-glint" aria-hidden="true"/>
      <span className="me-dock-lens" aria-hidden="true">
        <span className="me-dock-glass" ref={glass}/>
      </span>
      {destinations.map(key => {
        const running = key === 'jobs' && hasActiveJob;
        return <button key={key} className="me-workbench-destination" type="button"
          aria-current={view === key ? 'page' : undefined}
          aria-description={running ? '有评测正在进行' : undefined} onClick={() => onNavigate(key)}>
          <Icon name={key}/><span>{t[key]}</span>
          {running && <i className="me-nav-active-job" aria-hidden="true"/>}
        </button>;
      })}
    </div>
    <button className="me-workbench-destination me-workbench-settings" type="button"
      aria-current={view === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}>
      <Icon name="settings"/><span>{t.settings}</span>
    </button>
  </nav>;
}
