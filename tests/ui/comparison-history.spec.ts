import {test,expect} from '@playwright/test';
test('history uses retained summaries on demand and leaves original report navigation intact',async({page})=>{
  await page.goto('/?history=1');await page.getByRole('button',{name:'查看报告 Atlas-32B-Instruct',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'查看报告'});
  const before=await page.evaluate(()=>(window as any).fixtureActions.filter((x:string)=>x==='report'||x==='item').length);
  await dialog.getByText('同配置历史',{exact:true}).click();await expect(dialog.getByRole('img',{name:'同配置完整成绩趋势'})).toBeVisible();
  const after=await page.evaluate(()=>(window as any).fixtureActions.filter((x:string)=>x==='report'||x==='item').length);expect(after).toBe(before);
  await expect(dialog.getByRole('button',{name:/查看该轮报告/})).toHaveCount(2);await dialog.getByRole('button',{name:'写作历史',exact:true}).click();await expect(dialog.getByText('裁判变化，趋势不跨条件连线',{exact:true})).toBeVisible();
  await dialog.getByRole('tab',{name:'逐题明细',exact:true}).click();await expect(dialog.getByRole('button',{name:/tiny-mmlu/}).first()).toBeVisible();await page.keyboard.press('Escape');
});
test('one retained result has a record but no invented trend',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'查看报告 Atlas-32B-Instruct',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'查看报告'});
  await dialog.getByText('同配置历史',{exact:true}).click();await expect(dialog.getByRole('img',{name:'同配置完整成绩趋势'})).toHaveCount(0);await expect(dialog.getByRole('button',{name:/查看该轮报告/})).toHaveCount(1);
});
