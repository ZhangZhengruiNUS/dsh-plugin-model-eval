import {test,expect} from '@playwright/test';

test('popover fallback stays interactive and restores owned DOM on close and unmount',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined,configurable:true}));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?overlap=1');const first=page.getByRole('group',{name:'能力与响应散点图'}).getByRole('button').first();await first.focus();await page.keyboard.press('Enter');const detail=page.getByRole('region',{name:'配置观测详情'});await expect(detail).toBeVisible();expect(await detail.evaluate(e=>e.parentElement?.classList.contains("model-eval"))).toBe(true);await detail.getByRole('button',{name:/查看配置/}).last().click();await expect(detail).toBeVisible();await page.keyboard.press('Escape');await expect(detail).not.toBeVisible();await first.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'设置',exact:true}).click();await expect(detail).not.toBeVisible();expect(errors).toEqual([]);
});
test('scatter handles overlap missing metrics and preserves conditions',async({page})=>{
  await page.goto('/');const chart=page.getByRole('group',{name:'能力与响应散点图'});await expect(chart).toBeVisible();
  await expect(chart.getByRole('button')).toHaveCount(3); // Four score rows, one has no response observation.
  await chart.getByRole('button').first().focus();await page.keyboard.press('Enter');
  const detail=page.getByRole('region',{name:'配置观测详情'});await expect(detail).toBeVisible();await expect(detail).toContainText('未记录');
  await page.keyboard.press('Escape');await expect(detail).not.toBeVisible();
  await page.getByRole('button',{name:'正文首字等待',exact:true}).click();await expect(chart).toContainText('正文首字等待 · 秒');
  await page.locator('.me-scatter-card').getByRole('button',{name:'响应中位',exact:true}).click();
  await page.goto('/?overlap=1');const same=page.getByRole('button',{name:/同坐标 2 个配置/});await same.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('region',{name:'配置观测详情'}).getByRole('button',{name:/查看配置/})).toHaveCount(2);
  await page.getByRole('region',{name:'配置观测详情'}).getByRole('button',{name:/查看配置.*Q4-v2/}).click();await expect(page.getByRole('region',{name:'配置观测详情'})).toContainText('Q4-v2');
});
test('scatter never connects a unified frontier across different conditions',async({page})=>{
  await page.goto('/?chartConditions=1');await expect(page.getByRole('group',{name:'能力与响应散点图'})).toBeVisible();await expect(page.locator('.me-frontier')).toHaveCount(0);
  await expect(page.getByText('条件不同或未记录，不连接统一边界',{exact:true})).toBeVisible();
});
test('profiles use four general axes and five writing axes with exact signed differences',async({page})=>{
  await page.goto('/');await expect(page.getByRole('img',{name:/四轴通用能力雷达图/})).toBeVisible();
  await page.getByRole('checkbox',{name:/对比.*Q4-v2/}).check();await page.getByRole('button',{name:'差值',exact:true}).click();
  await expect(page.getByRole('img',{name:'相对基准的能力差值'})).toContainText('-2.0');
  await page.getByRole('tab',{name:'中文写作',exact:true}).click();await page.getByRole('button',{name:'轮廓',exact:true}).click();
  await expect(page.getByRole('img',{name:/五轴写作能力雷达图/})).toBeVisible();await expect(page.getByRole('img',{name:/五轴/})).toContainText('自然与得体');
});
