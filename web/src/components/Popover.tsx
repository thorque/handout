import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from './classNames';
import styles from './Popover.module.css';

export interface PopoverProps {
  /** The trigger's accessible name — it is a button, by contract. */
  triggerLabel: string;
  /** What the trigger shows; the protection marker of a row, for instance. */
  triggerContent?: ReactNode;
  /** The panel's heading, which also names the dialog. */
  heading: string;
  closeLabel?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/** A length the design keeps in a token, read off the element so it stays there. */
function tokenPixels(element: HTMLElement, name: string): number {
  const raw = getComputedStyle(element).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The design's Popover. It hangs off its trigger with `aria-haspopup="dialog"` and
 * `aria-expanded`, and it is closed without changes at any time — through "Schließen",
 * through `Escape`, or by clicking beside it. All three paths put the focus back on the
 * trigger; losing it to `<body>` is the regression this component is written against.
 *
 * The panel is rendered only while it is open, not hidden with CSS, so a closed popover
 * is out of the tab order and out of the accessibility tree.
 *
 * Direction is measured, never assumed: below the trigger when it fits, otherwise above,
 * and never over the trigger. The tab cycle inside the panel follows from `role="dialog"`
 * and is ours — the design is silent on Tab.
 */
export function Popover({
  triggerLabel,
  triggerContent,
  heading,
  closeLabel = 'Schließen',
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = `${panelId}-heading`;

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  // Placement and the first focus, both once the panel is in the document and measurable.
  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    const anchor = trigger.current;
    if (element === null || anchor === null) return;

    const edge = tokenPixels(element, '--ho-popover-edge');
    const rect = anchor.getBoundingClientRect();
    const room = window.innerHeight - rect.bottom - edge;
    setAbove(room < element.offsetHeight && rect.top - edge > room);

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
      close();
      // The browser moves the focus itself as the default action of this very mousedown —
      // onto whatever was clicked, or off everything when that is not focusable. Claiming
      // the focus back one microtask later is what makes the outside click behave like the
      // other two close paths instead of dropping the focus on <body>.
      queueMicrotask(() => trigger.current?.focus());
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const panelClasses = cx(styles.panel, above ? styles.above : styles.below);

  return (
    <span className={styles.anchor}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={triggerLabel}
        className="ho-link ho-touch"
        onClick={() => {
          setOpen((previous) => !previous);
        }}
      >
        {triggerContent ?? triggerLabel}
      </button>

      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          tabIndex={-1}
          className={panelClasses}
          onKeyDown={onPanelKeyDown}
        >
          <div className={styles.head}>
            <h2 id={headingId} className={styles.heading}>
              {heading}
            </h2>
            <button type="button" className="ho-link ho-touch" onClick={close}>
              {closeLabel}
            </button>
          </div>
          {children}
        </div>
      )}
    </span>
  );
}
