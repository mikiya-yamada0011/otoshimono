import {test,expect,Page,Locator} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true});
async function swipe(page:Page, target:Locator, direction:'left'|'right'|'down'):Promise<void> {
 const bounds=(await target.boundingBox())!;
 const x=bounds.x+bounds.width*(direction==='right'?.25:.75),y=Math.max(110,Math.min(bounds.y+24,650));
 const dx=direction==='left'?-bounds.width*.5:direction==='right'?bounds.width*.5:0,dy=direction==='down'?135:0;
 const client=await page.context().newCDPSession(page);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=6;step++) await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/6,y:y+dy*step/6}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await client.detach();
}

test('実タッチの左右スワイプで検索方法を切り替え、縦操作・タップ・写真拡大は維持する',async({page})=>{
 await page.route('https://photos.example.invalid/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')}));
 await page.goto('/?role=student');
 await page.evaluate(()=>{
  const key='lost-found-no-qr-test-harness-v1',db=JSON.parse(localStorage.getItem(key)!);
  db.photoBatches=[{id:'1',author:'staff-1',etag:'1',value:{window:'農学部事務室',receivedOn:new Date().toISOString().slice(0,10),photos:[{name:'one.png',url:'https://photos.example.invalid/one.png'}]}}];
  localStorage.setItem(key,JSON.stringify(db));
 });
 await page.reload();
 const items=page.getByRole('button',{name:'個別登録',exact:true}),photos=page.getByRole('button',{name:'写真掲載',exact:true});
 await swipe(page,page.locator('.lf-item-card').first(),'left');
 await expect(photos).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:/拾得物の写真/})).toBeVisible();
 await swipe(page,page.locator('.lf-swipe-region'),'down');
 await expect(photos).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:/写真1を拡大/}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await swipe(page,page.getByRole('dialog'),'right');
 await expect(photos).toHaveAttribute('aria-pressed','true');
 await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).click();
 await swipe(page,page.locator('.lf-swipe-region'),'right');
 await expect(items).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'警察へ移管済み',exact:true}).click();
 await expect(items).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'警察へ移管済み',exact:true})).toHaveAttribute('aria-pressed','true');
 await photos.click();await items.click();
 await expect(items).toHaveAttribute('aria-pressed','true');
});

test('対応中・終了分を下線タブとスワイプで切り替え、空の対応中から検索へ進める',async({page})=>{
 await page.goto('/?role=student');
 const nav=page.getByRole('navigation',{name:'学生メニュー'});
 await nav.getByRole('button',{name:'紛失した物',exact:true}).click();
 await expect(page.getByRole('button',{name:'紛失した物を登録',exact:true})).toHaveCount(0);
 const active=page.getByRole('button',{name:'対応中',exact:true}),completed=page.getByRole('button',{name:'終了分',exact:true});
 await expect(active).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const a=(await active.boundingBox())!,c=(await completed.boundingBox())!;expect(Math.abs(a.width-c.width)).toBeLessThan(1);
 await expect(page.getByRole('button',{name:'落とし物を探す',exact:true})).toBeVisible();
 await swipe(page,page.locator('.lf-swipe-region'),'left');
 await expect(completed).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'落とし物を探す',exact:true})).toHaveCount(0);
 await swipe(page,page.locator('.lf-swipe-region'),'left');
 await expect(completed).toHaveAttribute('aria-pressed','true');
 await swipe(page,page.locator('.lf-swipe-region'),'right');
 await expect(active).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'落とし物を探す',exact:true}).click();
 await expect(nav.getByRole('button',{name:'探す',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('短い・斜め・複数指・マウス・画面端の操作では切り替えない',async({page})=>{
 await page.goto('/?role=student');
 const region=page.locator('.lf-swipe-region');const box=(await region.boundingBox())!;
 const items=page.getByRole('button',{name:'個別登録',exact:true});
 for(const kind of ['short','diagonal','multi','cancel','mouse','edge']) {
  const x=kind==='edge'?10:250,y=box.y+20,type=kind==='mouse'?'mouse':'touch';
  const base={pointerId:1,pointerType:type,isPrimary:true,clientX:x,clientY:y};
  await region.dispatchEvent('pointerdown',base);
  if(kind==='multi')await region.dispatchEvent('pointerdown',{...base,pointerId:2,isPrimary:false});
  await region.dispatchEvent('pointermove',{...base,clientX:x-130,clientY:y+(kind==='diagonal'?120:0)});
  if(kind==='cancel')await region.dispatchEvent('pointercancel',base);
  await region.dispatchEvent('pointerup',{...base,clientX:x-(kind==='short'?25:130),clientY:y+(kind==='diagonal'?120:0)});
  await expect(items).toHaveAttribute('aria-pressed','true');
 }
});
