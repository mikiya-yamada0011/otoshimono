import * as React from 'react';
import { Item } from '../../types/model';

export function TransferInfo({item}: {item: Item}): React.ReactElement {
  return <div className="lf-transfer-info">
    <p className="lf-record-line"><span>移管日</span>{item.transferredAt || '未登録'}</p>
    <p className="lf-record-line"><span>移管先</span>{item.transferDestination || '未登録'}</p>
    <p className="lf-muted">学内では受け取れません。移管先へお問い合わせください。連絡先や受取方法は、移管元の{item.window}に確認できます。</p>
  </div>;
}
