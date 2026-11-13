import { useEffect, useRef } from "react";

export interface PosShortcutHandlers {
  focusSearch: () => void;
  pay: () => void;
  quote: () => void;
  focusQty: () => void;
  openCustomer: () => void;
  focusAmount: () => void;
  reprint: () => void;
  hold: () => void;
  togglePriceMode: () => void;
  toggleFullscreen: () => void;
  newBill: () => void;
  clearBill: () => void;
  removeLastLine: () => void;
  /** Whole-bill discount preset, in percent. 0 clears it. */
  quickDiscount: (percent: number) => void;
}

/** Ctrl+1..4 bill-discount presets. Ctrl+0 clears. */
export const QUICK_DISCOUNT_PRESETS = [5, 10, 15, 20] as const;

/** The key legend shown on screen, in the order a cashier reads it. */
export const POS_SHORTCUT_LEGEND: { keys: string; action: string }[] = [
  { keys: "F9 / Home", action: "Go to search" },
  { keys: "F4", action: "Quantity" },
  { keys: "F5", action: "Customer" },
  { keys: "F6 / End", action: "Amount received" },
  { keys: "F2", action: "Pay" },
  { keys: "F3", action: "Give quote" },
  { keys: "F7", action: "Reprint" },
  { keys: "F8", action: "Hold" },
  { keys: "F10", action: "Retail / Wholesale" },
  { keys: "F11", action: "Fullscreen" },
  { keys: "F12", action: "New bill" },
  { keys: "Esc", action: "Clear bill" },
  { keys: "Ctrl+Del", action: "Remove last item" },
  { keys: "Ctrl+1..4", action: "Bill discount 5 / 10 / 15 / 20%" },
  { keys: "Ctrl+0", action: "Remove bill discount" },
];

function isTypingField(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

/**
 * Any open dialog, popover or menu owns the keyboard; the till's shortcuts
 * stand down. Popovers count too — the hold-orders list and every dropdown
 * menu are popovers, and F2 must not complete a sale behind one.
 */
function dialogIsOpen(): boolean {
  return (
    document.querySelector('.MuiDialog-root [role="dialog"]') !== null ||
    document.querySelector(".MuiPopover-root") !== null
  );
}

/**
 * Function-key shortcuts for the till, so a cashier with one hand on the
 * scanner never needs the mouse.
 *
 * The listener is registered once. Handlers are read through a ref on every
 * keypress rather than captured at registration — otherwise each shortcut
 * would act on the cart as it was when the page first loaded.
 *
 * Every shortcut stands down while a dialog is open, so pressing F2 inside the
 * customer picker can never complete a sale behind it.
 */
export function usePosKeyboardShortcuts(handlers: PosShortcutHandlers, enabled = true): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (dialogIsOpen()) return;

      const h = ref.current;
      const fnKeys: Record<string, () => void> = {
        F2: h.pay,
        F3: h.quote,
        F4: h.focusQty,
        F5: h.openCustomer,
        F6: h.focusAmount,
        F7: h.reprint,
        F8: h.hold,
        F9: h.focusSearch,
        F10: h.togglePriceMode,
        F11: h.toggleFullscreen,
        F12: h.newBill,
      };

      const fn = fnKeys[e.key];
      if (fn && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Several of these are browser keys — F5 reloads the page and would
        // throw the whole cart away, F11 is the browser's own fullscreen.
        e.preventDefault();
        fn();
        return;
      }

      // Home jumps to search, but not while editing another field, where it
      // means "start of this line".
      if (e.key === "Home" && !e.ctrlKey && !isTypingField(e.target)) {
        e.preventDefault();
        h.focusSearch();
        return;
      }

      if (e.ctrlKey && e.key === "Delete") {
        e.preventDefault();
        h.removeLastLine();
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && /^[0-4]$/.test(e.key)) {
        e.preventDefault();
        const index = Number(e.key);
        h.quickDiscount(index === 0 ? 0 : QUICK_DISCOUNT_PRESETS[index - 1]);
        return;
      }

      // Esc clears the bill only when nothing else wants it: a field with text
      // in it uses Esc to clear itself first.
      if (e.key === "Escape") {
        const target = e.target as HTMLInputElement | null;
        if (isTypingField(target) && target?.value) return;
        h.clearBill();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
