import {test,expect} from '@playwright/test';
for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`comparison charts ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?1000:844});await page.emulateMedia({colorScheme:theme});await page.goto('/');await expect(page.locator('.me-profile-svg')).toBeVisible();
  await page.waitForTimeout(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local/comparison-visual/compare-${width}-${theme}.png`,fullPage:true});
  if(width===390){const region=page.getByRole('region',{name:'模型成绩对比表'});await region.scrollIntoViewIfNeeded();await expect(region.getByText('左右滑动查看完整对比',{exact:true})).toBeVisible();await region.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);}
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await expect(page.getByRole('img',{name:/五轴/})).toBeVisible();await page.waitForTimeout(250);await page.screenshot({path:`.local/comparison-visual/writing-${width}-${theme}.png`,fullPage:true});
});
test('host content and zero single many near and unknown states remain usable',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await page.goto('/?manyResults=1');await expect(page.locator('.me-comparison tbody tr')).toHaveCount(7);await page.locator('.me-compare-view').evaluate(e=>e.style.width='752px');await page.waitForTimeout(300);
  expect(await page.locator('.me-analysis-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(1);await page.screenshot({path:'.local/comparison-visual/host-752-many.png',fullPage:true});
  await page.goto('/?pending=1');await expect(page.locator('.me-focus-chip')).toHaveCount(1);await page.screenshot({path:'.local/comparison-visual/single.png',fullPage:true});
  await page.goto('/?empty=1');await expect(page.locator('.me-scatter-stage')).toHaveCount(0);await page.screenshot({path:'.local/comparison-visual/empty.png',fullPage:true});
  await page.goto('/?nearScores=1');await expect(page.locator('.me-profile-svg')).toBeVisible();await page.locator('.me-comparison input').nth(1).click();await page.getByRole('button',{name:'差值',exact:true}).click();await page.screenshot({path:'.local/comparison-visual/near-difference.png',fullPage:true});
  await page.goto('/?unknownProtocol=1');await page.getByLabel('评测协议',{exact:true}).selectOption({label:'未知协议 · archived-unknown'});await expect(page.locator('.me-frontier')).toHaveCount(0);await page.screenshot({path:'.local/comparison-visual/unknown.png',fullPage:true});
});
test('user changes animate while identical refresh and reduced motion do not replay',async({page})=>{
  await page.goto('/');await expect(page.locator('.me-profile-svg')).toBeVisible();await page.waitForTimeout(300);
  await page.evaluate(()=>{(window as any).comparisonMotion=[];const original=Element.prototype.animate;Element.prototype.animate=function(this:Element,...args:Parameters<Element['animate']>){if(this.matches('.me-profile-svg,tr'))(window as any).comparisonMotion.push(this.tagName);return original.apply(this,args);};});
  await page.getByRole('button',{name:'差值',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).comparisonMotion.length)).toBeGreaterThan(0);
  const before=await page.evaluate(()=>(window as any).comparisonMotion.length);await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForTimeout(100);expect(await page.evaluate(()=>(window as any).comparisonMotion.length)).toBe(before);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'轮廓',exact:true}).click();expect(await page.evaluate(()=>(window as any).comparisonMotion.length)).toBe(before);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.me-comparison').getByRole('button',{name:'综合分',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).comparisonMotion.includes('TR'))).toBe(true);
});

test('focus menu and high contrast retain readable chart controls',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'添加对比',exact:true}).click();const menu=page.locator('.me-focus-options');await expect(menu).toBeVisible();const box=(await menu.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThanOrEqual(844);await menu.getByRole('checkbox').nth(1).check();await expect(page.locator('.me-focus-chip')).toHaveCount(3);await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await page.screenshot({path:'.local/comparison-visual/three-focused.png'});
  await page.emulateMedia({forcedColors:'active'});await expect(page.locator('.me-point-shape').first()).toHaveCSS('fill','rgb(0, 0, 0)');await page.screenshot({path:'.local/comparison-visual/forced-colors.png'});
  await page.emulateMedia({forcedColors:'none'});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});await expect(page.locator('.me-focus-bar')).toHaveCSS('backdrop-filter','none');
});
