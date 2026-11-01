import {test,expect} from '@playwright/test';
test('selected configurations survive candidate search and reject a fourth selection',async({page})=>{
  await page.goto('/');const focus=page.getByRole('region',{name:'关注配置'});await expect(focus).toBeVisible();
  await focus.getByRole('button',{name:'添加对比',exact:true}).click();
  const boxes=focus.getByRole('checkbox');for(let i=0;i<4;i++){if(!await boxes.nth(i).isChecked())await boxes.nth(i).click();}
  await expect(boxes.filter({visible:true})).toHaveCount(4);expect(await boxes.evaluateAll(xs=>xs.filter(x=>(x as HTMLInputElement).checked).length)).toBe(3);
  await page.keyboard.press('Escape');await page.getByRole('searchbox').fill('no-match');await expect(focus.locator('.me-focus-chip')).toHaveCount(3);
  await focus.getByRole('button',{name:/移除/}).first().click();await expect(focus.locator('.me-focus-chip')).toHaveCount(2);
});
test('comparison uses root-bound snapshot instead of an independently returned history array',async({page})=>{
  await page.goto('/?rootRace=1');await expect(page.locator('.me-comparison')).toContainText('CurrentRoot-');await expect(page.locator('.me-comparison')).not.toContainText('WrongRoot-');
});
test('A B A delayed old epoch cannot replace current comparison or retain an old report',async({page})=>{
  await page.goto('/?scopeRace=1');await expect(page.locator('.me-comparison')).toContainText('Epoch-1-');
  await page.getByRole('button',{name:/查看报告 Epoch-1-/}).first().click();await expect(page.getByRole('dialog',{name:'查看报告'})).toBeVisible();await page.keyboard.press('Escape');
  await page.evaluate(()=>{(window as any).fixtureRoot('A',2);(window as any).holdComparison();});await page.getByRole('button',{name:'刷新',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).comparisonHeld)).toBe(true);
  await page.evaluate(()=>(window as any).fixtureRoot('B',3));await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.locator('.me-comparison')).toContainText('Epoch-3-');
  await page.evaluate(()=>(window as any).fixtureRoot('A',4));await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.locator('.me-comparison')).toContainText('Epoch-4-');
  await page.evaluate(()=>(window as any).releaseComparison());await expect.poll(()=>page.evaluate(()=>(window as any).comparisonReleased)).toBe(true);
  await page.waitForTimeout(100);await expect(page.locator('.me-comparison')).toContainText('Epoch-4-');await expect(page.locator('.me-comparison')).not.toContainText('Epoch-2-');
});
