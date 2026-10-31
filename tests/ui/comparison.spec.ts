import {test,expect} from '@playwright/test';

test('comparison search keeps configuration identity, track and report access',async({page})=>{
  await page.goto('/');const search=page.getByRole('searchbox',{name:'搜索模型、供应商或部署'});
  await search.fill('atlas');await expect(page.locator('.me-comparison tbody tr')).toHaveCount(2);await expect(page.getByRole('status')).toHaveText('2 / 4 个配置');
  await search.fill('q4-v2');await expect(page.locator('.me-comparison tbody tr')).toHaveCount(1);await expect(page.locator('.me-comparison')).toContainText('78.0');
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await expect(search).toHaveValue('q4-v2');await expect(page.locator('.me-comparison')).toContainText('77.5');
  await page.getByRole('button',{name:'查看报告 Atlas-32B-Instruct',exact:true}).click();await expect(page.getByRole('dialog',{name:'查看报告'})).toBeVisible();await page.keyboard.press('Escape');
  await search.fill('local-lab');await expect(page.locator('.me-comparison tbody tr')).toHaveCount(4);
  await search.fill('no-such-deployment');await expect(page.getByText('没有匹配的模型配置',{exact:true})).toBeVisible();await expect(page.getByRole('status')).toHaveText('0 / 4 个配置');
  await page.locator('.me-search-empty').getByRole('button',{name:'清空搜索',exact:true}).click();await expect(page.locator('.me-comparison tbody tr')).toHaveCount(4);
});

test('comparison discloses essential definitions and scoring method at point of need',async({page})=>{
  await page.goto('/?pending=1');await expect(page.getByText('整轮完成表示',{exact:false})).not.toBeVisible();const definition=page.locator('summary[aria-label="统计口径"]');await definition.focus();await page.keyboard.press('Enter');await expect(page.getByText(/整轮完成表示该轮/)).toBeVisible();
  await expect(page.locator('.me-comparison tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'评测方法',exact:true}).click();await expect(page.getByRole('button',{name:'评测方法',exact:true})).toHaveAttribute('aria-expanded','true');await expect(page.getByText(/与 AA 总分不同尺度/)).toBeVisible();
});

for(const theme of ['light','dark'] as const)for(const width of [1440,390])test(`comparison workspace ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:844});await page.emulateMedia({colorScheme:theme});await page.goto('/');await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const input=page.getByRole('searchbox');await expect(input).toBeInViewport();
  const row=page.getByRole('button',{name:'查看报告 Atlas-32B-Instruct',exact:true}).first();await expect(row).toBeInViewport();await row.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.screenshot({path:`docs/evidence/ui/alpha.7/compare-${width}-${theme}.png`,fullPage:true});
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await expect(page.getByText('混合裁判',{exact:true}).first()).toBeVisible();await page.screenshot({path:`docs/evidence/ui/alpha.7/writing-${width}-${theme}.png`,fullPage:true});
});

test('writing without complete scores directs existing incomplete work to jobs',async({page})=>{
  await page.goto('/?pending=1');await page.getByRole('tab',{name:'中文写作',exact:true}).click();
  await expect(page.getByText('已有未完成的中文写作评测，可前往评测页查看。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看评测任务',exact:true}).click();await expect(page.getByRole('button',{name:'继续评测',exact:true})).toBeVisible();
});
