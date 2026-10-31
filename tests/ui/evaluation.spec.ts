import {test,expect} from '@playwright/test';
test('evaluation_and_cleanup_user_journey',async({page})=>{
  await page.goto('/?empty=1');await expect(page.getByRole('button',{name:'准备环境',exact:true})).toBeVisible();await page.getByRole('button',{name:'准备环境',exact:true}).click();
  await page.getByRole('button',{name:'准备环境',exact:true}).click();await expect(page.getByText('环境已就绪').first()).toBeVisible();
  await page.getByRole('button',{name:'新建评测',exact:true}).click();const dialog=page.getByRole('dialog',{name:'新建评测'});
  await dialog.getByLabel('选择宿主模型',{exact:true}).selectOption({index:1});await dialog.getByText('本轮生成参数',{exact:true}).click();await dialog.getByLabel('最大输出 Token',{exact:true}).fill('8192');
  await dialog.getByRole('button',{name:'复制配置',exact:true}).click();await dialog.getByText('本轮生成参数',{exact:true}).last().click();await dialog.getByLabel('温度',{exact:true}).last().fill('0.9');
  await dialog.getByRole('button',{name:'开始评测',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  const elapsed=page.getByTestId('batch-elapsed').first(),tokens=page.getByTestId('batch-tokens').first();
  const initialElapsed=await elapsed.textContent(),initialTokens=await tokens.textContent();
  await expect.poll(()=>elapsed.textContent()).not.toBe(initialElapsed);
  await expect.poll(()=>tokens.textContent()).not.toBe(initialTokens);
  await page.screenshot({path:'docs/evidence/ui/progress-metrics-1440-light.png',fullPage:true});
  await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByRole('button',{name:'继续评测',exact:true})).toBeVisible();const pausedElapsed=await elapsed.textContent();await page.waitForTimeout(1100);await expect(elapsed).toHaveText(pausedElapsed!);await page.getByRole('button',{name:'继续评测',exact:true}).click();await expect(page.getByText('已完成',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'查看报告',exact:true}).first().click();const report=page.getByRole('dialog',{name:'查看报告'});await report.getByRole('tab',{name:'逐题明细',exact:true}).click();await report.getByRole('button',{name:/tiny-mmlu/}).first().click();
  await expect(report.getByText('<img src=x onerror="window.fixtureInjected=true">',{exact:true})).toBeVisible();await expect(report.locator('img[src=x]')).toHaveCount(0);await page.keyboard.press('Escape');
  await page.getByRole('navigation',{name:'模型测评'}).getByRole('button',{name:'历史',exact:true}).click();const check=page.getByRole('checkbox').first();await check.check();await expect(page.getByRole('button',{name:/清理所选明细/})).toBeEnabled();
  await page.getByRole('button',{name:/清理所选明细/}).click();const cleanup=page.getByRole('dialog',{name:'确认清理逐题明细'});await expect(cleanup.getByText('模型回答、逐题判分和调用明细将无法再查看。保留的成绩摘要仍可参与比较。')).toBeVisible();await cleanup.getByRole('button',{name:'清理明细',exact:true}).click();await expect(page.getByRole('dialog',{name:'清理完成'})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).last().click();await expect(page.getByText('明细已清理').first()).toBeVisible();
});
for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`actual layout ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({colorScheme:theme});await page.goto('/');await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390){const region=page.getByRole('region',{name:'模型成绩对比表'});await expect(page.getByText('左右滑动查看完整对比',{exact:true})).toBeVisible();expect(await region.evaluate(e=>{e.scrollLeft=e.scrollWidth;return e.scrollLeft>0;})).toBe(true);await region.evaluate(e=>{e.scrollLeft=0;});}
  await page.screenshot({path:`docs/evidence/ui/compare-${width}-${theme}.png`,fullPage:true});
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await expect(page.getByText('混合裁判',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:`docs/evidence/ui/writing-${width}-${theme}.png`,fullPage:true});
  await page.getByRole('button',{name:'新建评测',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});
test('partial cleanup shows remaining bytes and keeps the retry action',async({page})=>{
  await page.goto('/?partial=1');await page.getByRole('navigation',{name:'模型测评'}).getByRole('button',{name:'历史',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:/清理所选明细/}).click();await page.getByRole('dialog').getByRole('button',{name:'清理明细',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'部分文件未清理'})).toBeVisible();await expect(page.getByRole('button',{name:'重试剩余清理',exact:true})).toBeVisible();await page.screenshot({path:'docs/evidence/ui/cleanup-partial.png',fullPage:true});await page.getByRole('button',{name:'重试剩余清理',exact:true}).click();await expect(page.getByRole('dialog',{name:'清理完成'})).toBeVisible();
});

for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`batch metrics layout ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({colorScheme:theme});await page.goto('/?running=1');
  await page.getByRole('navigation',{name:'模型测评'}).getByRole('button',{name:'评测',exact:true}).click();
  await expect(page.getByText('累计 Token',{exact:true})).toBeVisible();await expect(page.getByText('部分用量',{exact:true})).toBeVisible();
  await expect(page.getByTestId('batch-elapsed')).toContainText('00:05:');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`docs/evidence/ui/progress-metrics-${width}-${theme}.png`,fullPage:true});
});
