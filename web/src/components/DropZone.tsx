import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { cx } from './classNames';
import { ExclamationIcon } from './icons';
import styles from './DropZone.module.css';

export type DropZoneState = 'idle' | 'busy' | 'error';

export interface DropZoneProps {
  /** `over` is not passed in: it is the component's answer to a drag, not a prop. */
  state?: DropZoneState;
  /** Shown while a file hangs over the surface, and while it is being unpacked. */
  fileName?: string;
  /** `busy`: what is being unpacked, e.g. "Entpacken · 118 Dateien". */
  busyLabel?: string;
  /** `busy`: 0…100. Rendered as a bar and as a percentage in words. */
  progress?: number;
  /** `error`: what went wrong. Always text, never colour alone. */
  message?: string;
  /** `error`: how to get out of it. */
  recovery?: string;
  onFiles?: (files: FileList) => void;
}

const IDLE_LABEL = 'Datei oder Zip hier ablegen';
const OVER_LABEL = 'Loslassen';

/**
 * The design's Ablegefläche — "das einzige Element, das sich auf eine Geste hin
 * verändert". The four states differ in border style (dashed while it waits, solid while
 * it works or has failed) and in their text, not only in colour.
 *
 * The picker sits behind a visually hidden `<input type="file">` inside its label, so Tab
 * reaches it and Enter or Space open the picker — no key handler, no div pretending to be
 * a button.
 */
export function DropZone({
  state = 'idle',
  fileName,
  busyLabel,
  progress,
  message,
  recovery,
  onFiles,
}: DropZoneProps) {
  const [over, setOver] = useState(false);
  const inputId = useId();
  const fill = useRef<HTMLDivElement>(null);

  // A percentage is measured, so it cannot be a token and cannot sit in the stylesheet.
  // It goes onto the element as a custom property rather than as a style prop, which
  // keeps every value the component *chooses* in the token layer.
  useEffect(() => {
    fill.current?.style.setProperty('--ho-progress', `${progress ?? 0}%`);
  }, [progress]);

  // Only an idle surface reacts to a drag: dropping onto a running unpack would ask the
  // user to queue work the service has no answer for yet.
  const draggable = state === 'idle';
  const shown = draggable && over ? 'over' : state;

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggable) return;
    event.preventDefault();
    setOver(true);
  };

  const onDragLeave = () => {
    setOver(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!draggable) return;
    event.preventDefault();
    setOver(false);
    if (onFiles !== undefined) onFiles(event.dataTransfer.files);
  };

  const classes = cx(
    'ho-drop',
    styles.drop,
    shown === 'busy' && styles.busy,
    shown === 'error' && styles.error,
  );

  return (
    <div
      className={classes}
      data-state={shown === 'over' ? 'over' : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {shown === 'idle' && (
        <div className={styles.centred}>
          <p className={styles.lead}>{IDLE_LABEL}</p>
          <label className={cx('ho-btn', 'ho-btn--secondary', styles.picker)} htmlFor={inputId}>
            Datei auswählen
            <input
              id={inputId}
              type="file"
              className={styles.input}
              onChange={(event) => {
                if (onFiles !== undefined && event.target.files !== null) {
                  onFiles(event.target.files);
                }
              }}
            />
          </label>
        </div>
      )}

      {shown === 'over' && (
        <div className={styles.centred}>
          <p className={styles.leadAccent}>{OVER_LABEL}</p>
          {fileName !== undefined && <p className={cx(styles.meta, styles.metaFile)}>{fileName}</p>}
        </div>
      )}

      {shown === 'busy' && (
        <div>
          <p className={styles.body}>{busyLabel ?? fileName}</p>
          <div className={styles.bar}>
            <div ref={fill} className={styles.fill} />
          </div>
          {/* The percentage as a word, not only as a bar width — a width has no name. */}
          <p className={cx(styles.meta, styles.metaProgress)}>{progress ?? 0} %</p>
        </div>
      )}

      {shown === 'error' && (
        <div className={styles.failure}>
          <span className={styles.glyph}>
            <ExclamationIcon />
          </span>
          <div>
            <p className={styles.bodyError}>{message}</p>
            {recovery !== undefined && <p className={styles.meta}>{recovery}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
