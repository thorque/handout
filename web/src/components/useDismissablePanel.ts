import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/** Whether a click on this node hands the focus to a control of its own. */
function isFocusable(target: Node): boolean {
  const element = target instanceof Element ? target : target.parentElement;
  return element?.closest(FOCUSABLE) !== null && element !== null;
}

export interface DismissablePanel<Trigger extends HTMLElement, Panel extends HTMLElement> {
  open: boolean;
  /** For the trigger's own click: open when closed, close when open. */
  toggle: () => void;
  close: (restoreFocus?: boolean) => void;
  trigger: RefObject<Trigger | null>;
  panel: RefObject<Panel | null>;
  /** Escape and the tab cycle. Belongs on the panel element. */
  onPanelKeyDown: (event: KeyboardEvent<Panel>) => void;
}

/**
 * A panel that hangs off a trigger and is closed without changes at any time — through
 * `Escape` or by clicking beside it. The behaviour `Popover` and `AccountMenu` share; what
 * each of them draws, and where it hangs, is theirs.
 *
 * The panel is rendered only while it is open, not hidden with CSS, so a closed panel is
 * out of the tab order and out of the accessibility tree. That is the caller's rendering,
 * and this hook assumes it: the focus moves into the panel as soon as it appears.
 *
 * **Where the focus goes when it closes** is the part that is easy to get wrong in both
 * directions. `Escape` and the caller's own close path always put it back on the trigger.
 * A click beside the panel does the same **when it landed on nothing focusable** —
 * otherwise the focus would fall onto `<body>`, and that loss is what the design guards
 * against. A click that landed on another control leaves the focus there: taking it back,
 * one microtask after the browser's own default action, would leave a field the user just
 * clicked unusable.
 *
 * The tab cycle inside the panel is ours — the design is silent on `Tab`.
 */
export function useDismissablePanel<
  Trigger extends HTMLElement,
  Panel extends HTMLElement,
>(): DismissablePanel<Trigger, Panel> {
  const [open, setOpen] = useState(false);
  const trigger = useRef<Trigger>(null);
  const panel = useRef<Panel>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    setOpen((previous) => !previous);
  }, []);

  // The first focus, once the panel is in the document.
  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    if (element === null) return;

    const first = focusableIn(element)[0];
    if (first === undefined) element.focus();
    else first.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) === true) return;
      if (trigger.current?.contains(target) === true) return;

      if (isFocusable(target)) {
        close(false);
        return;
      }

      close();
      queueMicrotask(() => trigger.current?.focus());
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  const onPanelKeyDown = (event: KeyboardEvent<Panel>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || panel.current === null) return;

    const items = focusableIn(panel.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { open, toggle, close, trigger, panel, onPanelKeyDown };
}
