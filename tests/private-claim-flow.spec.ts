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
  for (const entry of ['notice', 'candidate']) {
    test(`非公開案内は申告を明示し、確認後も同じカードで受取・取消できる（${entry}・${width}px）`, async ({page}) => {
      await page.setViewportSize({width, height:900});
      await seedInvitations(page);
      const menu = page.getByRole('navigation', {name:'学生メニュー'});
      if (entry === 'notice') {
        await menu.getByRole('button', {name:'お知らせ', exact:true}).click();
        const notices = page.locator('.lf-stack > article.lf-panel');
        await expect(notices).toHaveCount(2);
        await expect(notices.first().getByRole('heading')).toHaveText('「スマートフォン・携帯電話」の候補が見つかりました');
        await expect(notices.filter({hasText:'9月15日'})).toContainText('紛失登録：スマートフォン・携帯電話');
        await expect(notices.filter({hasText:'9月16日'})).toContainText('紛失登録：スマートフォン・携帯電話');
        await expect(page.locator('body')).not.toContainText('非公開の原本');
        await notices.filter({hasText:'9月15日'}).getByRole('button', {name:'候補を確認'}).click();
      } else {
        await menu.getByRole('button', {name:'紛失した物', exact:true}).click();
        const card = page.locator('.lf-record-card').filter({hasText:'9月15日'});
        await card.locator('.lf-candidates > summary').click();
        await card.getByRole('button', {name:'案内を確認'}).click();
      }
      const dialog = page.getByRole('dialog', {name:'受け取りの申し込み'});
      await expect(dialog.getByRole('heading', {name:'スマートフォン・携帯電話', exact:true})).toBeVisible();
      await expect(dialog).toContainText('9月15日');
      await expect(dialog).toContainText('受取窓口：農学部事務室');
      await expect(dialog).not.toContainText('非公開の原本');
      await expect(dialog).not.toContainText('黒い二つ折り財布');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).claims.length)).toBe(0);
      await page.screenshot({path:`temp/screenshots/private-claim-overview-${entry}-${width}.png`, fullPage:true});
      await dialog.locator('summary').click();
      await expect(dialog).toContainText('本人が申告した傷');
      await expect(dialog).not.toContainText('別のスマートフォンの特徴');
      await page.screenshot({path:`temp/screenshots/private-claim-confirm-${entry}-${width}.png`, fullPage:true});
      await dialog.getByRole('button', {name:'受け取りを申し込む', exact:true}).click();
      const cards = page.locator('.lf-record-card');
      const pending = cards.filter({has:page.getByText('受け取り予定', {exact:true})});
      await expect(cards).toHaveCount(2);
      await expect(pending.getByRole('heading')).toHaveText('スマートフォン・携帯電話');
      await expect(page.locator('body')).not.toContainText('拾得物の受け取り申し込み');
      await expect(page.locator('body')).not.toContainText('非公開の原本');
      const db = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!));
      expect(db.requests).toHaveLength(2);
      expect(db.claims).toHaveLength(1);
      expect(db.claims[0].value).toMatchObject({itemId:'4', requestId:'81', title:'スマートフォン・携帯電話', feature:'本人が申告した傷'});
      await menu.getByRole('button', {name:'お知らせ', exact:true}).click();
      await expect(page.getByRole('button', {name:'候補を確認'})).toHaveCount(0);
      await expect(page.locator('.lf-panel .lf-badge')).toHaveText('受け取り予定');
      await expect(page.getByRole('button', {name:'受け取り予定を確認'})).toHaveCount(0);
      await expect(page.locator('.lf-stack > article.lf-panel').getByRole('button')).toHaveCount(0);
      await expect(page.getByText('この候補は別の登録で受け取り予定です。', {exact:true})).toBeVisible();
      await menu.getByRole('button', {name:'紛失した物', exact:true}).click();
      page.once('dialog', confirm => confirm.accept());
      await pending.getByRole('button', {name:'受け取りをキャンセル'}).click();
      await expect(cards.locator('.lf-badge')).toHaveText(['候補あり', '候補あり']);
      await expect(cards.getByRole('heading')).toHaveText(['スマートフォン・携帯電話', 'スマートフォン・携帯電話']);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests.length)).toBe(2);
      expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBe(width);
      await page.screenshot({path:`temp/screenshots/private-claim-${entry}-${width}.png`, fullPage:true});
    });
  }
}

for (const width of [390, 1200]) {
  test(`未申込の非公開候補が終了しても紛失登録と通知履歴は残る（${width}px）`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await seedInvitations(page);
    await page.evaluate(() => {
      const key='lost-found-no-qr-test-harness-v1';
      const db=JSON.parse(localStorage.getItem(key)!);
      db.notices.forEach((row: {value: {unavailable?: boolean}}) => {row.value.unavailable=true;});
      localStorage.setItem(key,JSON.stringify(db));
    });
    await page.reload();
    const menu=page.getByRole('navigation',{name:'学生メニュー'});
    await menu.getByRole('button',{name:'紛失した物',exact:true}).click();
    await expect(page.locator('.lf-record-card')).toHaveCount(2);
    await expect(page.locator('.lf-record-card .lf-badge')).toHaveText(['探し中','探し中']);
    await expect(page.getByRole('button',{name:'案内を確認'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'編集',exact:true})).toHaveCount(2);
    await menu.getByRole('button',{name:'お知らせ',exact:true}).click();
    await expect(page.locator('.lf-stack > article.lf-panel')).toHaveCount(2);
    await expect(page.getByText('この候補は現在受け取りできません。',{exact:true})).toHaveCount(2);
    await expect(page.getByRole('button',{name:'候補を確認'})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('非公開の原本');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).claims.length)).toBe(0);
  });
}

test('削除済み申告の非公開通知は品名を推測せず申し込みを許可しない', async ({page}) => {
  await seedInvitations(page);
  await page.evaluate(() => {
    const key = 'lost-found-no-qr-test-harness-v1';
    const db = JSON.parse(localStorage.getItem(key)!);
    db.requests = [];
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole('navigation', {name:'学生メニュー'}).getByRole('button', {name:'お知らせ', exact:true}).click();
  await expect(page.locator('.lf-panel h3')).toHaveText(['候補が見つかりました', '候補が見つかりました']);
  await expect(page.getByRole('button', {name:'候補を確認'})).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('非公開の原本');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).claims.length)).toBe(0);
});
