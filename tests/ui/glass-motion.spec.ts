import {test,expect,type Locator} from '@playwright/test';

async function aligned(bar:Locator){await expect.poll(()=>bar.evaluate(e=>{
  const selected=e.querySelector('[aria-selected="true"],[aria-current="page"]')!.getBoundingClientRect(),pill=e.querySelector('.me-selection-indicator')!.getBoundingClientRect();
  return Math.max(Math.abs(selected.left-pill.left),Math.abs(selected.top-pill.top),Math.abs(selected.width-pill.width),Math.abs(selected.height-pill.height));
})).toBeLessThan(1.5);}

test('shared selection follows rapid choices and a vertical to horizontal resize',async({page})=>{
  await page.goto('/');const nav=page.getByRole('navigation',{name:'模型测评'}),tabs=page.getByRole('tablist',{name:'评测内容'});await aligned(nav);await aligned(tabs);
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await page.getByRole('tab',{name:'通用能力',exact:true}).click();await page.getByRole('tab',{name:'中文写作',exact:true}).click();await aligned(tabs);await expect(page.getByText('混合裁判',{exact:true}).first()).toBeVisible();
  await nav.getByRole('button',{name:'历史',exact:true}).click();await nav.getByRole('button',{name:'设置',exact:true}).click();await aligned(nav);await expect(page.getByRole('heading',{name:'环境与存储',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await aligned(nav);await nav.getByRole('button',{name:'模型对比',exact:true}).click();await aligned(nav);await aligned(tabs);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reduced motion keeps controls immediate and modal keyboard focus intact',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.getByRole('tab',{name:'中文写作',exact:true}).click();await aligned(page.getByRole('tablist',{name:'评测内容'}));
  await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'关闭',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(d.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  expect(await page.locator('.model-eval').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'新建评测',exact:true})).toBeFocused();
});

test('routine polling preserves the view and does not restart its entrance',async({page})=>{
  await page.goto('/?running=1');await page.getByRole('navigation').getByRole('button',{name:'评测',exact:true}).click();await page.getByTestId('batch-tokens').waitFor();
  await page.evaluate(()=>{(window as any).viewNode=document.querySelector('.me-page-content');(window as any).viewEntries=0;(window as any).viewNode.addEventListener('animationstart',()=>{(window as any).viewEntries++;});});
  const n=await page.evaluate(()=>(window as any).fixtureActions.filter((x:string)=>x==='history').length);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixtureActions.filter((x:string)=>x==='history').length)).toBeGreaterThan(n+1);
  expect(await page.evaluate(()=>(window as any).viewNode===document.querySelector('.me-page-content'))).toBe(true);expect(await page.evaluate(()=>(window as any).viewEntries)).toBe(0);
});

test('reduced transparency yields opaque surfaces without losing content',async({page,context})=>{
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await page.goto('/');
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  await expect(page.getByRole('table')).toBeVisible();expect(await page.locator('.me-sidebar').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
  await page.getByRole('button',{name:'新建评测',exact:true}).click();expect(await page.getByRole('dialog').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');await expect(page.getByRole('dialog').getByLabel('选择宿主模型',{exact:true})).toBeVisible();
});

test('high contrast retains selected controls and readable dialog actions',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});await page.goto('/');await page.getByRole('tab',{name:'中文写作',exact:true}).click();await aligned(page.getByRole('tablist',{name:'评测内容'}));await page.getByRole('button',{name:'新建评测',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'取消',exact:true})).toBeVisible();
  await page.screenshot({path:'docs/evidence/ui/alpha.8/forced-colors.png',animations:'disabled'});
});

for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`glass material ${width} ${theme}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({colorScheme:theme});await page.goto('/');await expect(page.getByRole('table')).toBeVisible();await aligned(page.getByRole('navigation'));await aligned(page.getByRole('tablist',{name:'评测内容'}));
  expect(await page.locator('.me-comparison').evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
  await page.screenshot({path:`docs/evidence/ui/alpha.8/compare-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'查看报告 Atlas-32B-Instruct',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible();await aligned(page.getByRole('tablist',{name:'查看报告'}));await page.screenshot({path:`docs/evidence/ui/alpha.8/report-${width}-${theme}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await expect.poll(()=>page.locator('.model-eval').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
});
