import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

for(const theme of ['light','dark'] as const)for(const width of [1280,390])test(`model list stays compact and identifiable ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:753});await page.emulateMedia({colorScheme:theme});await page.goto('/?namedModels=1');
 await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog'),combo=d.getByRole('combobox',{name:'选择宿主模型',exact:true});await combo.click();const list=d.getByRole('listbox');await expect(list).toBeVisible();
 await list.evaluate(async e=>{await Promise.allSettled(e.getAnimations({subtree:true}).map(a=>a.finished));});
 const metrics=await list.evaluate(e=>{const r=e.getBoundingClientRect(),options=[...e.querySelectorAll<HTMLElement>('[role=option]')];return {height:r.height,width:r.width,overflow:e.scrollWidth>e.clientWidth,rows:options.map(o=>{const b=o.getBoundingClientRect(),name=o.querySelector('strong')!.getBoundingClientRect(),meta=o.querySelector('small')!.getBoundingClientRect();return {height:b.height,fullyVisible:b.top>=r.top&&b.bottom<=r.bottom,sameLine:name.top<meta.bottom&&meta.top<name.bottom};})};});
 const dir=`.local/ui-density/${process.env.DENSITY_PHASE??'after'}`;await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/models-${width}-${theme}.png`});await writeFile(`${dir}/models-${width}-${theme}.json`,JSON.stringify(metrics,null,2));
 expect(metrics.overflow).toBe(false);expect(Math.max(...metrics.rows.map(r=>r.height))).toBeLessThanOrEqual(width===390?58:46);
 if(width===1280){expect(metrics.rows.every(r=>r.sameLine)).toBe(true);expect(metrics.rows.every(r=>r.fullyVisible)).toBe(true);}
 await expect(list.getByRole('option').nth(1)).toContainText('second-lab');await expect(list.getByRole('option').nth(1)).toContainText('atlas-32b-instruct');await list.getByRole('option').nth(1).click();await expect(d.getByLabel('部署版本（可选）')).toBeVisible();
 const last=await page.evaluate(()=>(window as any).fixtureRequests.filter((r:any)=>r.action==='snapshot').at(-1));expect(last.payload.providerId).toBe('second-lab');expect(last.payload.modelId).toBe('atlas-32b-instruct');
 await combo.click();await expect(list.getByRole('option',{selected:true})).toContainText('second-lab');await combo.press('Escape');await expect(combo).toBeFocused();
});
for(const width of [1280,390])test(`selected long model retains full identity and check clearance ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:753});await page.emulateMedia({colorScheme:'dark'});await page.goto('/?namedModels=1&longNamedModel=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();
 const d=page.getByRole('dialog'),combo=d.getByRole('combobox',{name:'选择宿主模型',exact:true});await combo.click();await d.getByRole('listbox').getByRole('option').nth(1).click();await expect(d.getByLabel('部署版本（可选）')).toBeVisible();await combo.click();
 const list=d.getByRole('listbox'),selected=list.getByRole('option',{selected:true});await expect(selected).toBeInViewport();await expect(selected).toContainText('revision-2026-11');
 expect(await selected.evaluate(e=>{const box=e.getBoundingClientRect(),text=e.querySelector('span')!.getBoundingClientRect(),check=e.querySelector('svg')!,r=check.getBoundingClientRect();return getComputedStyle(check).visibility==='visible'&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom&&text.right<=r.left&&e.scrollWidth<=e.clientWidth;})).toBe(true);
 expect(await list.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await list.evaluate(async e=>{await Promise.allSettled(e.getAnimations({subtree:true}).map(a=>a.finished));});await page.screenshot({path:`.local/ui-density/after/selected-long-${width}-dark.png`});await combo.press('Escape');await expect(combo).toBeFocused();
});
