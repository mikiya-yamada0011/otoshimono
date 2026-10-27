/** Monthly campus boxes: June intake stays public through September, ends October 1 (JST). */
export function campusDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = (type: string): string => parts.find(value => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function photoPublicStart(now: Date = new Date()): string {
  const day = campusDay(now);
  return new Date(Date.UTC(Number(day.slice(0,4)), Number(day.slice(5,7))-1-3, 1)).toISOString().slice(0,10);
}
export function photoPublicCutoffInstant(now: Date = new Date()): string {
  return new Date(`${photoPublicStart(now)}T00:00:00+09:00`).toISOString();
}
export function photoPublicationEndsOn(receivedOn: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return undefined;
  const parsed = new Date(`${receivedOn}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== receivedOn) return undefined;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth()+4, 1)).toISOString().slice(0,10);
}
export function isPhotoPublished(receivedOn: string, now: Date = new Date()): boolean {
  const end = photoPublicationEndsOn(receivedOn);
  const today = campusDay(now);
  return !!end && receivedOn <= today && today < end;
}
export function nextCampusMidnight(now: Date = new Date()): number {
  return Date.parse(`${campusDay(now)}T00:00:00+09:00`) + 86400000;
}
