import {expect,test} from '@playwright/test';
const collection='00000000-0000-4000-8000-000000000555';
const publisher='00000000-0000-4000-8000-000000000556';
const item='00000000-0000-4000-8000-000000000557';
test('guest can report, persist a publisher block and hide a direct shared link',async({page})=>{
  test.skip(process.env.PLAYWRIGHT_BACKEND_FIXTURE!=='true');
  await page.addInitScript(()=>{(window as any).turnstile={render:(_target:unknown,options:any)=>{queueMicrotask(()=>options.callback('fixture-captcha-token-that-is-long-enough'));return 'fixture';},remove:()=>{}};});
  let reported=false;
  await page.route('**/rest/v1/rpc/get_shared_collection',async route=>{
    const hidden=route.request().headers()['x-collectibles-blocks']?.includes(publisher);
    await route.fulfill({json:hidden?null:{collection:{id:collection,name:'Pins',publisherId:publisher},scope:{collectionId:collection,categoryId:null},categories:[],items:[{id:item,title:'Shared pin',hasPhoto:false,categoryId:null,categoryName:null}],total:1,hasMore:false}});
  });
  await page.route('**/functions/v1/public-safety',async route=>{reported=true;expect(route.request().postDataJSON().captchaToken).toBeTruthy();await route.fulfill({json:{ok:true}});});
  await page.goto(`/?collection=${collection}`);
  await page.getByRole('button',{name:'Report or block'}).click();
  await page.getByRole('button',{name:'Report collection',exact:true}).click();
  await page.getByRole('button',{name:'Send report',exact:true}).click();
  await expect(page.getByText('Report sent. We will review it.')).toBeVisible();expect(reported).toBe(true);
  await page.getByRole('button',{name:'Block collector',exact:true}).click();
  await page.getByRole('button',{name:'Block collector',exact:true}).click();
  await page.goto(`/?collection=${collection}`);
  await expect(page.getByText('Collection unavailable.',{exact:true})).toBeVisible();
  await expect(page.getByText('Shared pin',{exact:true})).toHaveCount(0);
});
for(const [path,title] of [['privacy','Privacy'],['terms','Terms of use'],['community','Community rules'],['support','Support'],['delete-account','Delete account']]) test(`public ${path} route loads and refreshes without signing in`,async({page})=>{
  await page.goto(`/${path}`);await page.reload();
  await expect(page.getByText(title!,{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Published by Abdul Syed')).toBeVisible();
  await expect(page.getByText('Contact: abdulksyed10@gmail.com')).toBeVisible();
});
