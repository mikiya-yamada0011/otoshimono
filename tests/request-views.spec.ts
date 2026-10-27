import { test, expect } from '@playwright/test';

for (const width of [390, 1200]) {
  test(`紛失した物は対応中を左・初期表示にし、受け取り済みを終了分へ分ける（${width}px）`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await page.goto('/?role=student');
    await page.evaluate(() => {
      const key='lost-found-no-qr-test-harness-v1', db=JSON.parse(localStorage.getItem(key)!);
      const criteria={parent:'P05',category:'P05_UMBRELLA_LONG',colors:[],campuses:[],building:'',dateFrom:'',dateTo:'',query:''};
      db.requests=['81','82','83','84'].map((id,index)=>({id,author:'student-1',etag:'1',value:{email:'s260001@stu.kobe-u.ac.jp',criteria,feature:'確認用'+id,status:index===3?'RESOLVED':'ACTIVE',createdAt:'2026-10-27T00:00:00Z'}}));
      db.notices=[{id:'1',author:'staff-1',etag:'1',value:{owner:'student-1',email:'s260001@stu.kobe-u.ac.jp',itemId:'1',requestId:'82',kind:'MATCH',title:'長傘',message:'候補',window:'農学部事務室',createdAt:'2026-10-27T00:00:00Z'}}];
      db.claims=['83','84'].map((id,index)=>({id,author:'student-1',etag:'1',value:{itemId:index?'2':'1',requestId:id,email:'s260001@stu.kobe-u.ac.jp',feature:'確認用',title:'長傘',window:'農学部事務室',status:index?'RETURNED':'PENDING',createdAt:'2026-10-27T00:00:00Z',...(index?{returnedAt:'2026-10-27T01:00:00Z'}:{})}}));
      db.claims.push({id:'85',author:'student-1',etag:'1',value:{itemId:'3',email:'s260001@stu.kobe-u.ac.jp',feature:'申告なしの受取',title:'鍵・鍵束',window:'工学部事務室',status:'RETURNED',createdAt:'2026-10-26T00:00:00Z',returnedAt:'2026-10-27T02:00:00Z'}});
      localStorage.setItem(key,JSON.stringify(db));
    });
    await page.reload();
    const nav=page.getByRole('navigation',{name:'学生メニュー'});
    await expect(nav.getByRole('button',{name:'返却履歴',exact:true})).toHaveCount(0);
    await expect(nav.getByRole('button')).toHaveCount(3);
    await nav.getByRole('button',{name:'紛失した物',exact:true}).click();
    const group=page.getByRole('group',{name:'紛失した物の表示'});
    const active=group.getByRole('button',{name:'対応中',exact:true});
    const completed=group.getByRole('button',{name:'終了分',exact:true});
    await expect(active).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.lf-record-card')).toHaveCount(3);
    for(const status of ['探し中','候補あり','受け取り予定']) await expect(page.locator('.lf-record-card .lf-badge').filter({hasText:status})).toHaveCount(1);
    await expect(page.locator('.lf-record-card')).not.toContainText(['受け取り済み','受け取り済み','受け取り済み']);
    expect((await active.boundingBox())!.x).toBeLessThan((await completed.boundingBox())!.x);
    await completed.click();
    await expect(completed).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.lf-record-card')).toHaveCount(2);
    const returned=page.locator('.lf-record-card');
    await expect(returned.filter({hasText:'農学部事務室'})).toContainText('受取日時');
    await expect(returned.filter({hasText:'工学部事務室'})).toContainText('受取日時');
    await expect(returned.filter({hasText:'農学部事務室'})).toContainText(/10月27日/);
    await expect(returned.filter({hasText:'工学部事務室'})).toContainText('鍵・鍵束');
    await expect(page.locator('.lf-record-card .lf-badge')).toHaveText(['受け取り済み','受け取り済み']);
    await expect(page.locator('.lf-record-card').getByRole('button',{name:'受け取りをキャンセル'})).toHaveCount(0);
    await nav.getByRole('button',{name:'探す',exact:true}).click();
    await nav.getByRole('button',{name:'紛失した物',exact:true}).click();
    await expect(active).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.lf-record-card')).toHaveCount(3);
    expect(await page.locator('body').evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`temp/screenshots/request-views-${width}.png`});
  });
}