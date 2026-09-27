import { test, expect } from '@playwright/test';

for(const width of [390,1200]) {
  test(`ありがとうは本人の履歴と返却状況を表示し、選んだ品物のお礼だけを開く（${width}px）`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/?role=student');
    await expect(page.locator('.lf-item-card').first()).toBeVisible();
    await page.evaluate(()=>{
      const key='lost-found-no-qr-test-harness-v1',db=JSON.parse(localStorage.getItem(key)!);
      const source={email:'s260001@stu.kobe-u.ac.jp',parent:'P07',category:'P07_BOTTLE',colors:['灰'],campus:'C02',building:'',place:'食堂入口',foundOn:'2026-09-27',feature:'',receiveReturnEmail:true,reason:'',window:'農学部事務室',itemId:'48'};
      db.submissions=[
        {id:'1',author:'student-1',etag:'1',value:{...source,title:'水筒・タンブラー・シェーカー',status:'ACCEPTED',itemStatus:'返却済み',returnedAt:'2026-09-28T01:00:00Z',createdAt:'2026-09-27T10:00:00Z'}},
        {id:'2',author:'student-1',etag:'1',value:{...source,title:'長傘',receiveReturnEmail:false,status:'ACCEPTED',itemStatus:'返却済み',returnedAt:'2026-09-28T01:00:00Z',createdAt:'2026-09-27T11:00:00Z'}},
        {id:'3',author:'student-1',etag:'1',value:{...source,title:'鍵',status:'ACCEPTED',itemStatus:'保管中',returnedAt:'',createdAt:'2026-09-27T12:00:00Z'}},
        {id:'4',author:'student-1',etag:'1',value:{...source,title:'ノート',status:'PENDING',createdAt:'2026-09-27T13:00:00Z'}},
        {id:'5',author:'student-1',etag:'1',value:{...source,title:'旧記録',status:'ACCEPTED',createdAt:'2026-09-27T09:00:00Z'}},
        {id:'6',author:'someone-else',etag:'1',value:{...source,title:'他人の拾得物',status:'ACCEPTED',itemStatus:'返却済み',createdAt:'2026-09-27T14:00:00Z'}},
      ];
      localStorage.setItem(key,JSON.stringify(db));
    });
    await page.reload();
    const nav=page.getByRole('navigation',{name:'学生メニュー'});
    await nav.getByRole('button',{name:'ありがとう',exact:true}).click();
    await expect(nav.getByRole('button',{name:'ありがとう',exact:true})).toHaveAttribute('aria-current','page');
    await expect(page.getByRole('main',{name:'ありがとう',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'ありがとう',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'再読込',exact:true})).toHaveCount(0);
    const cards=page.locator('article.lf-panel');
    await expect(cards).toHaveCount(5);
    await expect(cards.first()).toContainText('ノート');
    await expect(page.getByText('持ち主に返却済み',{exact:true})).toHaveCount(2);
    const thanksMessage=page.getByText('届けてくださった落とし物は、持ち主に返却できました。ご協力ありがとうございました。',{exact:true});
    await expect(thanksMessage).toHaveCount(0);
    await expect(page.locator('.lf-finder-thanks')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'お礼を見る',exact:true})).toHaveCount(2);
    await cards.filter({hasText:'長傘'}).getByRole('button',{name:'お礼を見る',exact:true}).click();
    const thanksDialog=page.getByRole('dialog',{name:'届けてくださってありがとうございました',exact:true});
    await expect(thanksDialog).toContainText('長傘');
    await expect(thanksDialog).toContainText('届け出日時：');
    await expect(thanksMessage).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(thanksDialog).toHaveCount(0);
    await expect(cards.filter({hasText:'長傘'}).getByRole('button',{name:'お礼を見る',exact:true})).toBeFocused();
    await cards.filter({hasText:'水筒・タンブラー・シェーカー'}).getByRole('button',{name:'お礼を見る',exact:true}).click();
    await expect(thanksDialog).toContainText('水筒・タンブラー・シェーカー');
    await expect(thanksDialog).not.toContainText('長傘');
    await expect(thanksMessage).toHaveCount(1);
    await thanksDialog.getByRole('button',{name:'閉じる',exact:true}).click();
    await expect(thanksMessage).toHaveCount(0);
    await expect(cards.filter({hasText:'長傘'})).toContainText('受け取らない');
    await expect(cards.filter({hasText:'旧記録'})).toContainText('受領済み（状況確認中）');
    await expect(page.getByText('他人の拾得物')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    const navBox=(await nav.boundingBox())!;
    expect(navBox.x+navBox.width).toBeLessThanOrEqual(width);
    for(const button of await nav.getByRole('button').all()) {
      const box=(await button.boundingBox())!;
      expect(box.width).toBeGreaterThan(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({path:`temp/screenshots/finder-history-${width}.png`,fullPage:true});
    // Reopening the tab reads corrected returns without a manual reload button.
    await page.evaluate(()=>{
      const key='lost-found-no-qr-test-harness-v1',db=JSON.parse(localStorage.getItem(key)!);
      db.submissions.filter((row:{id:string})=>['1','2'].includes(row.id)).forEach((row:{value:Record<string,unknown>})=>{row.value.itemStatus='保管中';row.value.returnedAt='';});
      localStorage.setItem(key,JSON.stringify(db));
    });
    await nav.getByRole('button',{name:'探す',exact:true}).click();
    await nav.getByRole('button',{name:'ありがとう',exact:true}).click();
    await expect(cards).toHaveCount(5);
    await expect(page.getByText('持ち主に返却済み',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'お礼を見る',exact:true})).toHaveCount(0);
    await expect(page.getByRole('region',{name:'届けてくださった方へのお礼'})).toHaveCount(0);
  });
}
