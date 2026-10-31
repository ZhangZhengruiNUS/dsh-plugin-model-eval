import * as React from 'react';
import {App} from './App.tsx';

const PANEL = '@aico/dsh-plugin-model-eval';
interface ClientContext {
  slots: {
    inject(slot: string, install: () => unknown): unknown;
    register(options: Record<string, unknown>, component: React.ComponentType): unknown;
  };
  effect(install: () => () => void, label?: string): unknown;
}
export const inject = ['slots'];

/** The host supplies React, navigation, theme tokens, and the existing root. */
export function apply(ctx: ClientContext): void {
  const Panel = () => <App/>;
  const Icon = () => <span aria-hidden="true">◫</span>;
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL, order: 35, label: '模型测评',
  }, Icon));
}
