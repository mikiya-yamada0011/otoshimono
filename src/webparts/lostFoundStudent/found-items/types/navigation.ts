import { Item, Request } from './model';

export type Page = 'search' | 'requests' | 'notices' | 'history' | 'settings' | 'found';

export type ModalState =
  | { kind: 'item'; item: Item; requestId?: string }
  | { kind: 'request'; request?: Request }
  | { kind: 'claim'; item: Item; requestId?: string }
  | { kind: 'private-claim'; request: Request; itemId: string; window: string }
  | { kind: 'found' }
  | { kind: 'filters' };

export type Run = (work: () => Promise<void>, message: string, after?: () => void) => void;

export const PAGE_LABELS: Record<Page, string> = {
  search: '落とし物を探す',
  requests: '紛失した物',
  notices: 'お知らせ',
  history: '返却履歴',
  found: 'ありがとう',
  settings: '利用者設定'
};

export const BOTTOM_PAGES: Page[] = ['search', 'requests', 'notices', 'history', 'found'];
