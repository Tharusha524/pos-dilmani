import { useCallback, useEffect, useState } from "react";

/**
 * Browser fullscreen for a given element.
 *
 * State is read from the browser rather than tracked locally, because
 * fullscreen can also be left in ways this app never sees — pressing Esc, the
 * F11 key, or switching apps. A locally held boolean would drift out of sync
 * with the real state and leave the button showing the wrong icon.
 *
 * Safari (including on iPad, a likely counter device) exposes only the
 * webkit-prefixed API, so both spellings are handled.
 */
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function currentFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;

  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useFullscreen(target?: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(
    () => currentFullscreenElement() !== null
  );

  useEffect(() => {
    const sync = () => setIsFullscreen(currentFullscreenElement() !== null);

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);

    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const node = (target?.current ?? document.documentElement) as FullscreenElement;

    try {
      if (node.requestFullscreen) {
        await node.requestFullscreen();
      } else if (node.webkitRequestFullscreen) {
        await node.webkitRequestFullscreen();
      }
    } catch {
      // Browsers reject this unless it came from a real user gesture, and
      // some kiosk setups block it outright. Failing quietly is right: the
      // page is perfectly usable windowed, so there is nothing to report.
    }
  }, [target]);

  const exit = useCallback(async () => {
    const doc = document as FullscreenDocument;

    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Already out of fullscreen, or the browser refused. Either way the
      // change event above keeps the reported state honest.
    }
  }, []);

  const toggle = useCallback(() => {
    if (currentFullscreenElement()) {
      void exit();
    } else {
      void enter();
    }
  }, [enter, exit]);

  /**
   * True when the browser offers fullscreen at all. iOS Safari on iPhone does
   * not, so the button is hidden there rather than shown doing nothing.
   */
  const isSupported =
    typeof document !== "undefined" &&
    Boolean(
      document.documentElement.requestFullscreen ||
        (document.documentElement as FullscreenElement).webkitRequestFullscreen
    );

  return { isFullscreen, isSupported, enter, exit, toggle };
}

export default useFullscreen;
