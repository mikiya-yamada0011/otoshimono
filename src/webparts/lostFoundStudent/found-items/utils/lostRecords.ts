import { Claim, Item, Request, Snapshot, categoryName } from '../types/model';

// Title is already an internal identity column in the SharePoint adapter.
// A claim-scoped key makes interrupted direct registrations resumable without
// adding a schema dependency or matching unrelated loss reports by similarity.
export const directRequestKey = (claimId: string): string => `request:claim:${claimId}`;

export type LostRecordStatus = '探し中' | '候補あり' | '受け取り予定' | '受け取り済み';
export type LostCandidate = { kind: 'public'; item: Item } | { kind: 'private'; itemId: string; window: string };
export interface LostRecord {
  id: string;
  request?: Request;
  claims: Claim[];
  candidates: LostCandidate[];
  title: string;
  status: LostRecordStatus;
  date: string;
}

function requestCandidates(data: Snapshot, request: Request): LostCandidate[] {
  const items = data.items.filter(item => item.status === '保管中' && !item.valuable);
  const candidates = new Map<string, LostCandidate>();
  const notices = data.notices.filter(notice => notice.requestId === request.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id, undefined, {numeric: true}));
  for (const notice of notices) {
    if (candidates.has(notice.itemId)) continue;
    if (notice.kind === 'VALUABLE') {
      if (data.claims.some(claim => claim.itemId === notice.itemId && claim.status === 'UNAVAILABLE')) continue;
      // Private invitations expose only the counter, never item details.
      candidates.set(notice.itemId, {kind: 'private', itemId: notice.itemId, window: notice.window});
    } else {
      const item = items.find(candidate => candidate.id === notice.itemId);
      if (item) candidates.set(item.id, {kind: 'public', item});
    }
  }
  // A cancelled direct application can be resumed without a candidate notice.
  const directClaim = data.claims.find(claim => request.key === directRequestKey(claim.id));
  const directItem = directClaim && items.find(item => item.id === directClaim.itemId);
  if (directItem && !candidates.has(directItem.id)) candidates.set(directItem.id, {kind: 'public', item: directItem});
  return [...candidates.values()];
}

export function lostRecords(data: Snapshot): LostRecord[] {
  const claims = data.claims.filter(claim => claim.status === 'PENDING' || claim.status === 'RETURNED');
  const assigned = new Set<string>();
  const records: LostRecord[] = [];
  for (const request of data.requests) {
    const linked = claims.filter(claim => claim.requestId === request.id || (!claim.requestId && request.key === directRequestKey(claim.id)));
    linked.forEach(claim => assigned.add(claim.id));
    if (request.status === 'CANCELLED' && !linked.length) continue;
    const returned = linked.find(claim => claim.status === 'RETURNED');
    const pending = linked.find(claim => claim.status === 'PENDING');
    const candidates = requestCandidates(data, request);
    records.push({
      id: `request-${request.id}`, request, claims: linked, candidates,
      title: categoryName(request.criteria.parent, request.criteria.category),
      status: request.status === 'RESOLVED' || returned ? '受け取り済み' : pending ? '受け取り予定' : candidates.length ? '候補あり' : '探し中',
      date: returned?.returnedAt || pending?.createdAt || request.createdAt
    });
  }
  // Existing standalone claims remain visible; they use exactly the same card
  // and state model as new registrations. Reading never mutates old records.
  for (const claim of claims.filter(candidate => !assigned.has(candidate.id))) {
    records.push({id: `claim-${claim.id}`, claims: [claim], candidates: [], title: claim.title,
      status: claim.status === 'RETURNED' ? '受け取り済み' : '受け取り予定', date: claim.returnedAt || claim.createdAt});
  }
  return records.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id, undefined, {numeric: true}));
}
