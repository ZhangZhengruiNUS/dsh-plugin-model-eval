/** Structural subset of the official Connection contract at ce7073d. */
export interface FetchRoute {
  path: string; methods: readonly ('GET' | 'HEAD' | 'POST')[]; requestBody: 'buffered' | 'streaming';
  fetch(request: Request): Promise<Response>;
}
export interface HostContext {
  connection: { fetch: { register(route: FetchRoute): () => Promise<void> } };
  effect(install: () => () => Promise<void>, label?: string): unknown;
}
export const name = '@aico/dsh-plugin-model-eval';
export const inject = ['connection'];

/** The Connection carrier, not this handler, admits authenticated owner peers. */
export function apply(ctx: HostContext): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/aico/model-eval/v1/status', methods: ['GET'], requestBody: 'buffered',
    async fetch() {
      return Response.json({ apiVersion: 1, plugin: name, ready: false, stage: 'development' }, {
        headers: { 'cache-control': 'no-store' },
      });
    },
  }), 'model-eval: authenticated status route');
}
