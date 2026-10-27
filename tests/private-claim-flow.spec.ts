import { test, expect, Page } from '@playwright/test';

async function seedInvitations(page: Page): Promise<void> {
  await page.goto('/?role=student');
  await page.evaluate(() => {
    const key = 'lost-found-no-qr-test-harness-v1';
    const db = JSON.parse(localStorage.getItem(key)!);
    db.requests = ['81', '82'].map((id, index) => ({id, author:'student-1', etag:'1', value:{
      criteria:{parent:'P02', category:'P02_SMARTPHONE', colors:['白'], campuses:['C01','C02'], building:'', dateFrom:'', dateTo:'', query:''},
      feature:index ? '別のスマートフォンの特徴' : '本人が申告した傷', status:'ACTIVE', createdAt:`2026-09-${index ? '16' : '15'}T00:00:00Z`
    }}));
    db.notices = ['81', '82'].map((requestId, index) => ({id:String(index+1), author:'staff-1', etag:'1', value:{
      owner:'student-1', email:'s260001@stu.kobe-u.ac.jp', itemId:'4', requestId, claimId:'', kind:'VALUABLE',
      title:'非公開の原本品名', message:'非公開の原本特徴', window:'農学部事務室', createdAt:'2026-09-27T00:00:00Z'
    }}));
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.reload();
}

for (const width of [390, 1200]) {
  test(`旧非公開品の手動案内を表示しない（${width}px）`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await seedInvitations(page);
    const menu=page.getByRole('navigation',{name:'学生メニュー'});
    await menu.getByRole('button',{name:'お知らせ',exact:true}).click();
    await expect(page.getByRole('button',{name:'候補を確認',exact:true})).toHaveCount(0);
    await menu.getByRole('button',{name:'紛失した物',exact:true}).click();
    await expect(page.getByRole('button',{name:'案内を確認',exact:true})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('非公開の原本');
  });
}
