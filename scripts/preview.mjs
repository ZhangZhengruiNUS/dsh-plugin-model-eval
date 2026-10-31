/** Development-only fixture viewer; never included in the plugin package. */
import {build} from 'esbuild';import {createServer} from 'node:http';import {mkdir,readFile} from 'node:fs/promises';
await mkdir('.local/preview',{recursive:true});
await build({entryPoints:['tests/ui/fixture.tsx'],outfile:'.local/preview/app.js',bundle:true,platform:'browser',format:'esm',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"development"'}});
const server=createServer(async(request,response)=>{
  if(new URL(request.url,'http://localhost').pathname==='/app.js'){response.setHeader('content-type','text/javascript');response.end(await readFile('.local/preview/app.js'));return;}
  response.setHeader('content-type','text/html; charset=utf-8');response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型测评 · 界面测试数据</title><style>.me-overlay{top:24px!important}.me-dialog{max-height:calc(100dvh - 44px)!important}body{margin:0}#fixture-notice{position:sticky;top:0;z-index:1100;background:#344a54;color:#fff;font:10px/24px system-ui;text-align:center;letter-spacing:1px}#root{height:calc(100vh - 24px)}</style><div id="fixture-notice">界面测试数据 · 非真实模型成绩</div><div id="root"></div><script type="module" src="/app.js"></script></html>');
});server.listen(4178,'127.0.0.1',()=>process.stdout.write('Fixture viewer: http://127.0.0.1:4178\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
