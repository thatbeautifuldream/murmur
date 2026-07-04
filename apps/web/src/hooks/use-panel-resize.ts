import { useCallback, useRef, useState } from "react";

type TUsePanelResizeArgs = {
  minWidth: number;
  maxWidth: number;
  initialWidth: number;
  onWidthChange?: (width: number) => void;
};

export function usePanelResize({
  minWidth,
  maxWidth,
  initialWidth,
  onWidthChange,
}: TUsePanelResizeArgs) {
  const [width, setWidth] = useState(initialWidth);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const delta = startX - ev.clientX;
        const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(next);
        onWidthChange?.(next);
      };

      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width, minWidth, maxWidth, onWidthChange],
  );

  return { width, onPointerDown, setWidth };
}
