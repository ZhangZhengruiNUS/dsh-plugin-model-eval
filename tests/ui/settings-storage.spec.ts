import {test,expect,type Page} from '@playwright/test';

async function storageFixture(page:Page,mode:'normal'|'partial'|'late'|'navigation'){
 await page.addInitScript(mode=>{
  let original=window.fetch.bind(window);const state={bytes:100*1024**2,queries:0,oldReturned:false};(window as any).storageProbe=state;
  const transport:typeof fetch=async(input,init)=>{
   const e=JSON.parse(String(init?.body??'{}'));const response=await original(input,init);
   if(e.action==='prepare'){
    if(mode==='navigation')await new Promise<void>(r=>(window as any).releasePrepare=r);
    state.bytes=(mode==='partial'?150:200)*1024**2;
    if(mode==='partial')return Response.json({schemaVersion:1,requestId:e.requestId,ok:false,error:{code:'FIXTURE_PARTIAL',message:'部分资源准备失败'}});
   }
   if(e.action==='usage'){
    const reply=await response.json();reply.data.resourceBytes=state.bytes;const n=++state.queries;
    if(mode==='late'&&n===1){await new Promise<void>(r=>(window as any).releaseOldUsage=r);state.oldReturned=true;}
    return Response.json(reply);
   }
   return response;
  };
  Object.defineProperty(window,'fetch',{configurable:true,get:()=>transport,set:value=>{original=value;}});
 },mode);
 await page.goto('/');await expect(page.getByRole('navigation').getByRole('button',{name:'设置',exact:true})).toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'设置',exact:true}).click();
}
const resourceTotal=(page:Page)=>page.locator('.me-storage-row').filter({hasText:'离线资源'}).locator('b');
const prepare=(page:Page)=>page.locator('.me-settings-grid > .me-card').filter({has:page.getByRole('heading',{name:'离线资源',exact:true})}).getByRole('button',{name:'刷新',exact:true});

test('already-ready environment refreshes total immediately after preparing without leaving Settings',async({page})=>{
 await storageFixture(page,'normal');await expect(resourceTotal(page)).toHaveText('100.0 MB');
 await prepare(page).click();await expect(resourceTotal(page)).toHaveText('200.0 MB');
 expect(await page.evaluate(()=>(window as any).fixtureActions.filter((s:string)=>s==='prepare').length)).toBe(1);
});
test('partial preparation refreshes actual bytes even when the operation reports an error',async({page})=>{
 await storageFixture(page,'partial');await expect(resourceTotal(page)).toHaveText('100.0 MB');
 await prepare(page).click();await expect(page.getByText('部分资源准备失败',{exact:true})).toBeVisible();await expect(resourceTotal(page)).toHaveText('150.0 MB');
});
test('an older capacity response cannot overwrite the post-preparation measurement',async({page})=>{
 await storageFixture(page,'late');await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseOldUsage)).toBe('function');
 await prepare(page).click();await expect(resourceTotal(page)).toHaveText('200.0 MB');await page.evaluate(()=>(window as any).releaseOldUsage());
 await expect.poll(()=>page.evaluate(()=>(window as any).storageProbe.oldReturned)).toBe(true);await expect(resourceTotal(page)).toHaveText('200.0 MB');
});
test('leaving and returning during preparation still refreshes on completion',async({page})=>{
 await storageFixture(page,'navigation');await expect(resourceTotal(page)).toHaveText('100.0 MB');await prepare(page).click();
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).releasePrepare)).toBe('function');
 await page.getByRole('navigation').getByRole('button',{name:'历史',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'设置',exact:true}).click();
 await page.evaluate(()=>(window as any).releasePrepare());await expect(resourceTotal(page)).toHaveText('200.0 MB');
});
