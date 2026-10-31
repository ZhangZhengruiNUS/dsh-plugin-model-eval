import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject, type HostContext, type FetchRoute } from '../../src/index.ts';

test('host probe owns one exact route and returns an unload disposer', async () => {
  const routes: FetchRoute[] = [];
  const cleanups: (() => Promise<void>)[] = [];
  const ctx: HostContext = {
    connection: { fetch: { register(route) {
      routes.push(route);
      return async () => { routes.splice(routes.indexOf(route), 1); };
    } } },
    effect(install) { cleanups.push(install()); },
  };
  assert.deepEqual(inject, ['connection']);
  apply(ctx);
  assert.equal(routes.length, 1);
  assert.equal(routes[0]!.path, '/api/aico/model-eval/v1/status');
  assert.deepEqual(routes[0]!.methods, ['GET']);
  const result = await routes[0]!.fetch(new Request('http://localhost/api/aico/model-eval/v1/status'));
  const status = await result.json();
  assert.equal(status.apiVersion, 1);
  assert.equal(status.ready, false);
  assert.equal(status.plugin, '@aico/dsh-plugin-model-eval');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  await cleanups[0]!();
  assert.equal(routes.length, 0);
});
