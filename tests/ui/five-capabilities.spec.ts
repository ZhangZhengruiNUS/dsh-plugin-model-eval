import {test,expect} from '@playwright/test';
test('new scores emphasize total then five capabilities and retain provenance below',async({page})=>{
 await page.goto('/?five=1');await expect(page.getByRole('img',{name:'五轴任务能力雷达图'})).toBeVisible();
 const table=page.getByRole('table');for(const name of ['任务综合分','知识与推理','资料理解','指令遵循','代码能力','工具使用'])await expect(table.getByRole('button',{name,exact:true})).toBeVisible();
 await expect(table.locator('.me-model > span').first()).toContainText('local-lab');
 await table.getByRole('button',{name:/查看报告 Atlas/}).first().click();const report=page.getByRole('dialog',{name:'查看报告'});await expect(report.getByText('任务综合能力 · 轻量 · 100题')).toBeVisible();await expect(report.locator('.me-domain-bars').getByText('资料理解',{exact:true})).toBeVisible();
 await report.getByText('评测依据与计分方式',{exact:true}).click();await expect(report.getByText(/LongBench v2/)).toBeVisible();await expect(report.getByText(/50题来自49份材料/)).toBeVisible();await expect(report.getByText(/五项各占20%/)).toBeVisible();
});
test('new run and upgrade expose100/350 and reuse100 plus250; old group keeps four axes',async({page})=>{
 await page.goto('/?five=1');await page.getByRole('button',{name:'新建评测',exact:true}).click();const form=page.getByRole('dialog');await expect(form.getByRole('radio',{name:/轻量 · 100题/})).toBeChecked();await expect(form.getByRole('radio',{name:/深入 · 350题/})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('table').getByRole('button',{name:/查看报告 Atlas/}).first().click();await page.getByRole('button',{name:'补测为深入',exact:true}).click();const upgrade=page.getByRole('dialog',{name:'补测为深入'});await expect(upgrade.getByText('轻量 100题 → 深入 350题')).toBeVisible();await upgrade.getByRole('button',{name:'预览补测',exact:true}).click();await expect(upgrade.getByTestId('reuse-count')).toHaveText('100');await expect(upgrade.getByTestId('new-count')).toHaveText('250');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'评测协议',exact:true}).selectOption({label:'通用基线 · 905题'});await expect(page.getByRole('img',{name:'四轴通用能力雷达图'})).toBeVisible();await expect(page.getByRole('table').getByRole('button',{name:'资料理解',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).fixtureActions.filter((a:string)=>['createBatch','commitUpgrade'].includes(a)).length)).toBe(0);
});
for(const colorScheme of ['light','dark'] as const)for(const width of [1440,390])test(`five capability layout ${width} ${colorScheme}`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?1000:844});await page.emulateMedia({colorScheme,reducedMotion:'reduce'});await page.goto('/?five=1');await expect(page.getByRole('img',{name:'五轴任务能力雷达图'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`docs/evidence/ui/five/compare-${width}-${colorScheme}.png`,animations:'disabled'});
 await page.getByRole('table').getByRole('button',{name:/查看报告 Atlas/}).first().click();await expect(page.getByRole('dialog').locator('.me-domain-bars').getByText('资料理解',{exact:true})).toBeVisible();await page.screenshot({path:`docs/evidence/ui/five/report-${width}-${colorScheme}.png`,animations:'disabled'});
});
