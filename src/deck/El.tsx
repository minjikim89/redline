import { createContext, useContext, type ReactNode } from 'react';

const SlideCtx = createContext<string>('');
export const SlideScope = SlideCtx.Provider;
export const useSlideId = () => useContext(SlideCtx);

/**
 * Wraps any annotatable region. The (slideId, elementId) pair is the anchor
 * an annotation pins to — never a coordinate, so annotations survive edits.
 */
export function El({ id, label, children, block }:
  { id: string; label?: string; children: ReactNode; block?: boolean }) {
  const slideId = useSlideId();
  return (
    <div
      className={`el${block ? ' el-block' : ''}`}
      data-slide-id={slideId}
      data-el-id={id}
      data-el-label={label ?? id}
    >
      {children}
    </div>
  );
}
