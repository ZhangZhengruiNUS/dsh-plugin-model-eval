import type {Track} from '../contracts.ts';
import type {ResolvedProtocolSet} from '../evaluation/tier-contracts.ts';
import type {RequiredItem} from '../history/store.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {isLongTasksFirstSchema} from '../evaluation/five-schema.ts';

const policy = 'long-tasks-first-v1';
const domainOrder = ['coding', 'reading', 'tools', 'knowledge', 'instructions'] as const;

export interface FrozenExecutionOrder {
  policy: typeof policy;
  itemIds: string[];
  hash: string;
}

export function buildExecutionOrder(protocol: ResolvedProtocolSet, tracks: readonly Track[]): FrozenExecutionOrder | undefined {
  const definition = protocol.descriptor.general;
  if (!isLongTasksFirstSchema(definition.schema) || !tracks.includes('general')) return undefined;
  const itemIds = domainOrder.flatMap(id => definition.domains.find(domain => domain.id === id)?.itemIds ?? []);
  if (tracks.includes('writing')) itemIds.push(...protocol.items.filter(item => item.track === 'writing').map(item => item.id));
  const order = {policy, itemIds, hash: identityHash({policy, itemIds})} as const;
  assertExecutionOrderStructure(order, protocol.items.filter(item => tracks.includes(item.track)));
  return order;
}

export function assertExecutionOrderStructure(order: FrozenExecutionOrder, requiredItems: readonly RequiredItem[]): void {
  const required = new Set(requiredItems.map(item => item.id));
  if (!order || order.policy !== policy || !Array.isArray(order.itemIds) ||
      order.itemIds.length !== requiredItems.length || new Set(order.itemIds).size !== requiredItems.length ||
      order.itemIds.some(id => !required.has(id)) ||
      order.hash !== identityHash({policy, itemIds: order.itemIds})) {
    throw Error('INVALID_EXECUTION_ORDER');
  }
}

export function validateExecutionOrder(order: FrozenExecutionOrder, requiredItems: readonly RequiredItem[], expected: FrozenExecutionOrder): void {
  assertExecutionOrderStructure(order, requiredItems);
  if (order.hash !== expected.hash) throw Error('EXECUTION_ORDER_CHANGED');
}

/** General-only recovery may validate the frozen prefix without loading archived writing. */
export function validateGeneralOrderPrefix(order:FrozenExecutionOrder,requiredItems:readonly RequiredItem[],expected:FrozenExecutionOrder):void{
  assertExecutionOrderStructure(order,requiredItems);
  if(identityHash(order.itemIds.slice(0,expected.itemIds.length))!==identityHash(expected.itemIds))throw Error('EXECUTION_ORDER_CHANGED');
}
