import { useEffect, useId, useState, type ReactNode } from 'react';
import { cx } from './classNames';
import { useDismissablePanel } from './useDismissablePanel';
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

/** A length the design keeps in a token, read off the element so it stays there. */
function tokenPixels(element: HTMLElement, name: string): number {
  const raw = getComputedStyle(element).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The design's Popover. It hangs off its trigger with `aria-haspopup="dialog"` and
 * `aria-expanded`, and it is closed without changes at any time — through "Schließen",
 * through `Escape`, or by clicking beside it. Those three close paths, the tab cycle and
 * what the focus does afterwards live in `useDismissablePanel`, which `AccountMenu` shares;
 * the rules are written out there.
 *
 * The panel is rendered only while it is open, not hidden with CSS, so a closed popover
 * is out of the tab order and out of the accessibility tree.
 *
 * Direction is measured, never assumed: below the trigger when it fits, otherwise above,
 * and never over the trigger. That measurement is this component's own — the account menu
 * hangs off a header at the top of the viewport, where the answer could only ever be
 * "below".
 */
export function Popover({
  triggerLabel,
  triggerContent,
  heading,
  closeLabel = 'Schließen',
  children,
}: PopoverProps) {
  const { open, toggle, close, trigger, panel, onPanelKeyDown } = useDismissablePanel<
    HTMLButtonElement,
    HTMLDivElement
  >();
  const [above, setAbove] = useState(false);
  const panelId = useId();
  const headingId = `${panelId}-heading`;

  // Placement, once the panel is in the document and measurable.
  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    const anchor = trigger.current;
    if (element === null || anchor === null) return;

    const edge = tokenPixels(element, '--ho-popover-edge');
    const rect = anchor.getBoundingClientRect();
    const room = window.innerHeight - rect.bottom - edge;
    setAbove(room < element.offsetHeight && rect.top - edge > room);
  }, [open, panel, trigger]);

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
        onClick={toggle}
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
            <button
              type="button"
              className="ho-link ho-touch"
              onClick={() => {
                close();
              }}
            >
              {closeLabel}
            </button>
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      )}
    </span>
  );
}
