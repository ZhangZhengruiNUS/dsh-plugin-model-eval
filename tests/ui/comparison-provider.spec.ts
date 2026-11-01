import {test,expect} from '@playwright/test';
for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`provider and model remain distinct ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme});await page.goto('/?providerPair=1');
  const chart=page.getByRole('group',{name:'能力与响应散点图'});await expect(chart.getByRole('button')).toHaveCount(2);
  for(const provider of ['local-lab','second-lab']){const label=chart.locator('.me-point-label').filter({hasText:provider});await expect(label).toHaveCount(1);await expect(label).toContainText('Shared-model');}
  await page.getByRole('checkbox',{name:'对比 second-lab / Shared-model · INT8',exact:true}).check();await expect(page.locator('.me-focus-chip')).toHaveCount(2);for(const provider of ['local-lab','second-lab']){await expect(page.locator('.me-focus-chips')).toContainText(provider+' / Shared-model');await expect(page.locator('.me-profile-legend')).toContainText(provider+' / Shared-model');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.mouse.move(4,4);await page.evaluate(()=>{document.querySelector('.me-main')!.scrollTop=0;window.scrollTo(0,0);});await page.waitForTimeout(260);await page.screenshot({path:`.local/comparison-provider/${width}-${theme}.png`,fullPage:true});
});
