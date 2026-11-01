import {test,expect,type Page} from '@playwright/test';
async function historyGap(page:Page,min:number){await expect.poll(()=>page.locator('.me-history-view').evaluate(e=>{
  const tabs=e.querySelector('[role=tablist]')!.getBoundingClientRect(),content=e.querySelector('.me-history-content')!.getBoundingClientRect();return content.top-tabs.bottom;
})).toBeGreaterThanOrEqual(min);}
for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`surface spacing ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({colorScheme:theme});await page.goto('/');await expect(page.getByRole('table')).toBeVisible();
 await page.screenshot({path:`.local/ui-regression/alpha.9/compare-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('navigation').getByRole('button',{name:'历史',exact:true}).click();await historyGap(page,16);await expect(page.locator('.me-history-row').first()).toBeVisible();
 await page.screenshot({path:`.local/ui-regression/alpha.9/history-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('tab',{name:'测速记录',exact:true}).click();await expect(page.getByText('尚无测速记录',{exact:true})).toBeVisible();await historyGap(page,16);
 await page.getByRole('navigation').getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('heading',{name:'环境与存储',exact:true})).toBeVisible();
 expect(await page.locator('.me-settings-main').evaluate(e=>{const title=e.querySelector('h2')!.getBoundingClientRect(),input=e.querySelector('input')!.getBoundingClientRect();return Math.abs(title.left-input.left);})).toBeLessThan(1.5);
 await expect(page.getByLabel('数据目录',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.local/ui-regression/alpha.9/settings-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
});
test('history spacing survives no formal records and either tab',async({page})=>{await page.goto('/?speedOnly=1');await page.getByRole('navigation').getByRole('button',{name:'历史',exact:true}).click();await expect(page.getByText('尚无本地历史',{exact:true})).toBeVisible();await historyGap(page,16);await page.getByRole('tab',{name:'测速记录',exact:true}).click();await expect(page.getByText('尚无测速记录',{exact:true})).toBeVisible();await historyGap(page,16);});
