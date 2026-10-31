import {test,expect} from '@playwright/test';
import {chooseModel} from './helpers.ts';
test('model combobox keyboard navigation, escape, typeahead and focus return',async({page})=>{
  await page.goto('/');const launch=page.getByRole('button',{name:'新建评测',exact:true});await launch.click();
  const d=page.getByRole('dialog'),combo=d.getByRole('combobox',{name:'选择宿主模型',exact:true});
  await combo.focus();await combo.press('ArrowDown');await expect(d.getByRole('listbox')).toBeVisible();await combo.press('End');await combo.press('Enter');await expect(combo).toContainText('Reviewer-Large-v2');
  await expect(d.getByLabel('部署版本（可选）')).toBeVisible();await combo.press('ArrowDown');await combo.press('Home');await combo.press('Escape');await expect(d.getByRole('listbox')).toHaveCount(0);await expect(d).toBeVisible();await expect(combo).toContainText('Reviewer-Large-v2');await expect(combo).toBeFocused();
  await combo.press('o');await combo.press('Enter');await expect(combo).toContainText('Orion-14B');await expect(d.getByRole('button',{name:'开始评测',exact:true})).toBeEnabled();
  await combo.press('ArrowDown');await combo.press('Home');await combo.press('Tab');await expect(combo).toContainText('Atlas-32B');await expect(combo).not.toBeFocused();expect(await d.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(d).toHaveCount(0);await expect(launch).toBeFocused();
});
test('dropdown can select a new target and dismiss outside without leaking focus',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await chooseModel(d);await d.getByLabel('部署版本（可选）').fill('draft');await chooseModel(d,1);
  await expect(d.getByLabel('部署版本（可选）')).toHaveValue('');const combo=d.getByRole('combobox',{name:'选择宿主模型'});await combo.click();await expect(d.getByRole('listbox').getByRole('option',{selected:true})).toContainText('Orion');await d.getByRole('heading',{name:'新建评测'}).click();await expect(d.getByRole('listbox')).toHaveCount(0);await expect(d).toBeVisible();
  await d.getByRole('button',{name:'关闭',exact:true}).focus();await page.keyboard.press('Shift+Tab');await expect(d.getByRole('button',{name:'开始评测',exact:true})).toBeFocused();
});
test('confirming the current model keeps edited deployment, parameters and snapshot',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await chooseModel(d);await d.getByLabel('部署版本（可选）').fill('Q4-custom');await d.getByText('本轮生成参数',{exact:true}).click();await d.getByLabel('温度',{exact:true}).fill('0.2');
  const combo=d.getByRole('combobox',{name:'选择宿主模型'}),snapshots=await page.evaluate(()=>(window as any).fixtureActions.filter((a:string)=>a==='snapshot').length);
  for(const key of ['Enter','Tab']){await combo.click();await combo.press(key);await expect(d.getByLabel('部署版本（可选）')).toHaveValue('Q4-custom');await expect(d.getByLabel('温度',{exact:true})).toHaveValue('0.2');}
  await chooseModel(d);await expect(d.getByLabel('部署版本（可选）')).toHaveValue('Q4-custom');expect(await page.evaluate(()=>(window as any).fixtureActions.filter((a:string)=>a==='snapshot').length)).toBe(snapshots);
});
test('single model can retry a failed snapshot and empty catalog is disabled',async({page})=>{
  await page.goto('/?singleModel=1&snapshotFailOnce=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();let d=page.getByRole('dialog');await chooseModel(d);await expect(d.getByRole('alert')).toHaveText('界面测试操作失败。');await chooseModel(d);await expect(d.getByLabel('部署版本（可选）')).toBeVisible();await expect(d.getByRole('alert')).toHaveCount(0);await expect(d.getByRole('button',{name:'开始评测',exact:true})).toBeEnabled();
  await page.goto('/?noModels=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();d=page.getByRole('dialog');await expect(d.getByRole('combobox',{name:'选择宿主模型'})).toBeDisabled();await expect(d.getByText('尚未读取到已配置模型，请检查宿主模型设置。')).toBeVisible();
});
test('wheel scrolling a long model list does not snap back to its active option',async({page})=>{
  await page.goto('/?manyModels=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('combobox',{name:'选择宿主模型'}).click();const list=d.getByRole('listbox');await list.hover();await page.mouse.wheel(0,700);await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(300);await expect(list.getByRole('option').first()).not.toBeInViewport();
});
test('model list stays usable when the native popover API is unavailable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined,configurable:true}));await page.setViewportSize({width:390,height:844});await page.goto('/?manyModels=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await d.getByRole('combobox',{name:'选择宿主模型'}).click();const list=d.getByRole('listbox');await expect(list).toBeVisible();expect(await list.evaluate(e=>{const r=e.getBoundingClientRect(),b=document.querySelector('.me-dialog-body')!.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom;})).toBe(true);await list.getByRole('option').nth(1).click();await expect(d.getByRole('combobox',{name:'选择宿主模型'})).toContainText('Orion');
});
for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`dialog surfaces ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:900});await page.emulateMedia({colorScheme:theme});await page.goto('/?manyModels=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();let d=page.getByRole('dialog');await d.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));await page.screenshot({path:`docs/evidence/ui/alpha.11/new-run-closed-${width}-${theme}.png`,fullPage:true});await d.getByRole('combobox',{name:'选择宿主模型'}).click();
  const list=d.getByRole('listbox');await expect(list).toBeVisible();expect(await list.evaluate(e=>{const r=e.getBoundingClientRect(),body=document.querySelector('.me-dialog-body')!.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=body.top-1&&r.bottom<=body.bottom+1&&e.scrollWidth<=e.clientWidth;})).toBe(true);
  await d.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));await page.screenshot({path:`docs/evidence/ui/alpha.11/new-run-${width}-${theme}.png`,fullPage:true});await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('.me-model-report').first().click();d=page.getByRole('dialog');await expect(d.locator('.me-report-scores')).toBeVisible();await d.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));await page.screenshot({path:`docs/evidence/ui/alpha.11/report-${width}-${theme}.png`,fullPage:true});expect(await d.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
test('lower judge dropdown fits above footer, long list scrolls and reduced motion holds',async({page})=>{
  await page.setViewportSize({width:1280,height:753});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?manyModels=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();const d=page.getByRole('dialog');await chooseModel(d);await d.getByRole('checkbox',{name:/中文写作/}).check();const judge=d.getByRole('combobox',{name:'裁判模型'});await judge.scrollIntoViewIfNeeded();await judge.click();await judge.press('End');
  await expect(d.getByRole('listbox').getByRole('option').last()).toBeInViewport();expect(await d.getByRole('listbox').evaluate(e=>{const r=e.getBoundingClientRect(),foot=document.querySelector('.me-dialog-foot')!.getBoundingClientRect();return r.bottom<=foot.top&&r.top>=document.querySelector('.me-dialog-head')!.getBoundingClientRect().bottom&&getComputedStyle(e).animationName==='none';})).toBe(true);await judge.press('Escape');await expect(d).toBeVisible();
});
