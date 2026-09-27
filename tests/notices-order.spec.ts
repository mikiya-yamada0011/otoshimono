import { test, expect } from '@playwright/test';

for (const width of [390, 1200]) {
  test(`お知らせは取得順にかかわらず最新が上、再読込と新着追加でも順序を維持する（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?role=student&lfNotice=1');
    const headings = page.locator('.lf-stack > article.lf-panel h3');
    const titles = ['「財布」の候補が見つかりました', '「長傘」の候補が見つかりました', '「水筒・タンブラー・シェーカー」の候補が見つかりました', '「ペンケース」の候補が見つかりました'];
    const addedTitle = '「スマートフォン・携帯電話」の候補が見つかりました';
    for (const order of [['10', '9', '2', '100'], ['100', '2', '9', '10'], ['9', '100', '10', '2']]) {
      await page.evaluate(order => {
        const key = 'lost-found-no-qr-test-harness-v1';
        const db = JSON.parse(localStorage.getItem(key)!);
        db.requests = [['81','P01','P01_WALLET'],['82','P05','P05_UMBRELLA_LONG'],['83','P07','P07_BOTTLE'],['84','P06','P06_PENCIL_CASE']].map(([id,parent,category]) => ({id,author:'student-1',etag:'1',value:{criteria:{parent,category,colors:[],campuses:[],building:'',dateFrom:'',dateTo:'',query:''},feature:'',status:'ACTIVE',createdAt:'2026-09-01T00:00:00Z'}}));
        const notices = [
          { id: '10', requestId: '81', createdAt: '2026-09-27T01:00:00.000Z', title: '最新の窓口案内', kind: 'VALUABLE' },
          { id: '9', requestId: '82', createdAt: '2026-09-27T01:00:00.000Z', title: '同時刻の候補通知', kind: 'MATCH' },
          { id: '2', requestId: '83', createdAt: '2026-09-26T01:00:00.000Z', title: '昨日の候補通知', kind: 'MATCH' },
          { id: '100', requestId: '84', createdAt: '2026-09-25T01:00:00.000Z', title: '最も古い窓口案内', kind: 'VALUABLE' }
        ];
        db.notices = order.map(id => {
          const notice = notices.find(notice => notice.id === id)!;
          return { id, author: 'staff-1', etag: '1', value: { key: `notice:${id}`, owner: 'student-1', email: 's260001@stu.kobe-u.ac.jp', itemId: '1', claimId: '', message: '条件に合う候補があります。', window: '農学部事務室', ...notice } };
        });
        db.notices.push({ id: '101', author: 'staff-1', etag: '1', value: { key: 'notice:other', owner: 'student-2', email: 'other@stu.kobe-u.ac.jp', itemId: '1', requestId: '82', claimId: '', title: '別の学生への通知', kind: 'MATCH', message: '', window: '農学部事務室', createdAt: '2026-09-29T01:00:00.000Z' } });
        localStorage.setItem(key, JSON.stringify(db));
      }, order);
      await page.reload();
      await expect(headings).toHaveText(titles);
      await expect(page.getByText('別の学生への通知')).toHaveCount(0);
    }
    await page.evaluate(() => {
      const key = 'lost-found-no-qr-test-harness-v1';
      const db = JSON.parse(localStorage.getItem(key)!);
      db.requests.push({...db.requests[0],id:'85',value:{...db.requests[0].value,criteria:{...db.requests[0].value.criteria,parent:'P02',category:'P02_SMARTPHONE'}}});
      db.notices.push({ id: '1', author: 'staff-1', etag: '1', value: { key: 'notice:added', owner: 'student-1', email: 's260001@stu.kobe-u.ac.jp', itemId: '1', requestId: '85', claimId: '', title: '追加された新着通知', kind: 'MATCH', message: '新しい候補があります。', window: '農学部事務室', createdAt: '2026-09-28T01:00:00.000Z' } });
      localStorage.setItem(key, JSON.stringify(db));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(headings).toHaveText([addedTitle, ...titles]);
    expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBe(width);
    await page.screenshot({ path: `temp/screenshots/student-notices-newest-first-${width}.png` });
    await page.reload();
    await expect(headings).toHaveText([addedTitle, ...titles]);
    await page.getByRole('navigation', { name: '学生メニュー' }).getByRole('button', { name: '探す', exact: true }).click();
    await page.getByRole('navigation', { name: '学生メニュー' }).getByRole('button', { name: 'お知らせ', exact: true }).click();
    await expect(headings).toHaveText([addedTitle, ...titles]);
  });
}
