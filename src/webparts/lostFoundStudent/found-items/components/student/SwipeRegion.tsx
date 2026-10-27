import * as React from 'react';

interface Gesture { id: number; x: number; y: number; at: number; locked: boolean; }

// Only horizontal touch gestures on the list change tabs. Native vertical
// scrolling and pinch zoom remain available; form controls and dialogs opt out.
export function SwipeRegion({onPrevious, onNext, children}: {
  onPrevious?: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const gesture = React.useRef<Gesture>();
  const suppressClickUntil = React.useRef(0);
  const reset = (): void => { gesture.current = undefined; };
  return <div className="lf-swipe-region"
    onPointerDown={event => {
      suppressClickUntil.current = 0;
      if (event.pointerType !== 'touch' || event.currentTarget.closest('fieldset:disabled')) return;
      if (gesture.current || !event.isPrimary) { reset(); return; }
      const target = event.target as Element;
      if (target.closest('input,select,textarea,a,summary,[role="dialog"],[contenteditable="true"],.lf-photo-open')) return;
      if (target.closest('button,[role="button"]') && !target.closest('.lf-item-card')) return;
      // Leave screen-edge gestures to the browser's back/forward navigation.
      if (event.clientX < 24 || event.clientX > window.innerWidth - 24) return;
      gesture.current = {id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now(),locked:false};
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId || event.currentTarget.closest('fieldset:disabled')) return;
      const dx = Math.abs(event.clientX-start.x), dy = Math.abs(event.clientY-start.y);
      if (!start.locked && dy > 10 && dy >= dx) { reset(); return; }
      if (!start.locked && dx > 20 && dx > dy*1.8) {
        start.locked = true;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic test events have no active pointer. */ }
      }
    }}
    onPointerCancel={reset}
    onLostPointerCapture={event => { if (event.target === event.currentTarget) reset(); }}
    onPointerUp={event => {
      const start = gesture.current;
      reset();
      if (!start || start.id !== event.pointerId || event.currentTarget.closest('fieldset:disabled')) return;
      const dx = event.clientX-start.x, dy = Math.abs(event.clientY-start.y);
      if (!start.locked || Math.abs(dx) < 64 || Math.abs(dx) <= dy*1.8 || Date.now()-start.at > 800) return;
      const change = dx < 0 ? onNext : onPrevious;
      if (!change) return;
      suppressClickUntil.current = Date.now()+500;
      change();
    }}
    onClickCapture={event => {
      if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); suppressClickUntil.current = 0; }
    }}
  >{children}</div>;
}
