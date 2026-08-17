import { cx } from './classNames';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** The visible label; the control carries it, so clicking it hits the control. */
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** The words under the label. The state is never carried by the knob alone. */
  onLabel?: string;
  offLabel?: string;
  onChange: (next: boolean) => void;
}

/**
 * The design's Schalter, from "Eingabefelder und Schalter". The state is stated three
 * times: `aria-checked` for assistive technology, the word "An"/"Aus" for everyone, and
 * the knob's position for the eye.
 *
 * The label lives inside the button rather than next to it, so clicking the text is
 * clicking the control and focus lands where the action is.
 */
export function Switch({
  label,
  checked,
  disabled = false,
  onLabel = 'An',
  offLabel = 'Aus',
  onChange,
}: SwitchProps) {
  const trackClasses = cx(styles.track, checked && styles.on);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={styles.control}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span aria-hidden="true" className={trackClasses}>
        <span className={styles.knob} />
      </span>
      <span>
        {label}
        <span className={styles.state}>{checked ? onLabel : offLabel}</span>
      </span>
    </button>
  );
}
