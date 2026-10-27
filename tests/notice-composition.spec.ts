import { test, expect } from '@playwright/test';

for (const width of [390, 1200]) {
  test(`自動照合のお知らせを表示し、旧手動案内は表示しない（${width}px）`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await page.goto('/?role=student');
    await page.evaluate(() => {
      const key = 'lost-found-no-qr-test-harness-v1';
      const db = JSON.parse(localStorage.getItem(key)!);
      db.requests = ['81', '82'].map((id, index) => ({id, author:'student-1', etag:'1', value:{
        criteria:{parent:'P02', category:'P02_SMARTPHONE', colors:[], campuses:[], building:'', dateFrom:'', dateTo:'', query:''},
        feature:'本人が入力した特徴', status:'ACTIVE', createdAt:`2026-09-${index ? '16' : '15'}T00:00:00Z`
      }}));
      db.notices = ['MATCH', 'VALUABLE'].map((kind, index) => ({id:String(index+1), author:'staff-1', etag:'1', value:{
        key:`notice:composition:${index}`, owner:'student-1', email:'s260001@stu.kobe-u.ac.jp', itemId:index ? '4' : '1',
        requestId:index ? '82' : '81', claimId:'', kind, title:'旧形式の見出し', message:'原本の秘密の特徴',
        window:'農学部事務室', createdAt:'2026-09-27T00:00:00Z'
      }}));
      localStorage.setItem(key, JSON.stringify(db));
    });
    await page.reload();
    const menu = page.getByRole('navigation', {name:'学生メニュー'});
    await menu.getByRole('button', {name:'お知らせ', exact:true}).click();
    const cards = page.locator('.lf-stack > article.lf-panel');
    const publicNotice = cards.filter({hasText:'9月15日'});
    const privateNotice = cards.filter({hasText:'9月16日'});
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('h3')).toHaveText(['「スマートフォン・携帯電話」の候補が見つかりました']);
    for (const card of [publicNotice]) {
      expect(await card.evaluate(element => Array.from(element.children).map(child => child.tagName))).toEqual(['SPAN','H3','P','P','P','BUTTON']);
      await expect(card.locator('p').nth(0)).toContainText('紛失登録：スマートフォン・携帯電話');
      await expect(card.locator('p').nth(1)).toContainText('登録した内容に近い品物が届いています。');
      await expect(card.locator('p').nth(2)).toHaveText('受取窓口：農学部事務室');
      await expect(card.getByRole('button')).toHaveText('候補を確認');
    }
    await expect(publicNotice.locator('p').nth(1)).toHaveText('登録した内容に近い品物が届いています。');
    await expect(page.locator('body')).not.toContainText('旧形式の見出し');
    await expect(page.locator('body')).not.toContainText('原本の秘密の特徴');
    await page.screenshot({path:`temp/screenshots/notice-composition-${width}.png`, fullPage:true});
    await publicNotice.getByRole('button', {name:'候補を確認'}).click();
    const publicDialog = page.getByRole('dialog', {name:'拾得物の詳細'});
    await expect(publicDialog).toContainText('受付番号 #1');
    await publicDialog.getByRole('button', {name:'閉じる', exact:true}).click();
    await expect(privateNotice).toHaveCount(0);
    expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBe(width);
  });
}
