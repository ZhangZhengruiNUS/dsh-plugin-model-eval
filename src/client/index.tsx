import * as React from 'react';
import {App} from './App.tsx';
import {BrandIcon} from './ui.tsx';

const PANEL = 'dsh-model-coordinates';
interface ClientContext {
  slots: {
    inject(slot: string, install: () => unknown): unknown;
    register<Props>(options: Record<string, unknown>, component: React.ComponentType<Props>): unknown;
  };
  effect(install: () => () => void, label?: string): unknown;
}
export const inject = ['slots'];

/** The host supplies React, navigation, theme tokens, and the existing root. */
export function apply(ctx: ClientContext): void {
  const Panel = () => <App/>;
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL, order: 35, label: '模型评测',
  }, ({size = 16}: {size?: number}) => <BrandIcon size={size}/>));
}
