import { useId } from 'react';
import { useTheme, type ThemePreference } from '../theme/useTheme';
import { CheckIcon } from './icons';
import { useDismissablePanel } from './useDismissablePanel';
import styles from './AccountMenu.module.css';

export interface AccountMenuProps {
  name: string;
  email: string;
  onSignOut: () => void;
}

const APPEARANCES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

/**
 * The initials the profile mark shows: the first letters of the first two words of the
 * name the identity provider hands over. **Never the address**, and never a part of it —
 * an address on the header is readable over a shoulder, and the design puts it inside the
 * menu for exactly that reason.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The profile mark in the application header and the menu it opens: who is signed in, the
 * appearance, and signing out. The three of them are what the design puts here — the
 * settings that are needed rarely and have to lie in one fixed place.
 *
 * Closing follows `useDismissablePanel`, the same behaviour as `Popover`: `Escape` or a
 * click beside it, and the focus back on the mark. It hangs off a header at the top of the
 * viewport, so it does not measure its direction the way `Popover` does — the answer could
 * only ever be "below".
 *
 * The appearance entries are `role="radio"` inside a `role="radiogroup"`, as the design
 * draws them, although strict ARIA would want `menuitemradio` inside a menu. The design is
 * the source of truth; the deviation is recorded in docs/design-system.md rather than
 * silently corrected. The chosen entry carries a check glyph, so it is not marked by colour
 * alone. All three stay tab stops — the design is silent on arrow keys.
 *
 * The mechanics behind the two actions are elsewhere: the theme is HAN-23's `ThemeProvider`,
 * and signing out is HAN-8's, reached through the `onSignOut` callback.
 */
export function AccountMenu({ name, email, onSignOut }: AccountMenuProps) {
  const { open, toggle, close, trigger, panel, onPanelKeyDown } = useDismissablePanel<
    HTMLButtonElement,
    HTMLDivElement
  >();
  const { preference, setPreference } = useTheme();
  const menuId = useId();
  const nameId = `${menuId}-name`;
  const appearanceId = `${menuId}-appearance`;

  return (
    <span className={styles.anchor}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Konto ${name}`}
        className={styles.trigger}
        onClick={toggle}
      >
        {initialsOf(name)}
      </button>

      {open && (
        <div
          ref={panel}
          id={menuId}
          role="menu"
          aria-labelledby={nameId}
          tabIndex={-1}
          className={styles.panel}
          onKeyDown={onPanelKeyDown}
        >
          <div className={styles.identity}>
            <p id={nameId} className={styles.name}>
              {name}
            </p>
            <p className={styles.email}>{email}</p>
          </div>

          <div className={styles.appearance}>
            <span id={appearanceId} className={styles.label}>
              Erscheinungsbild
            </span>
            <div role="radiogroup" aria-labelledby={appearanceId} className={styles.choices}>
              {APPEARANCES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="radio"
                  aria-checked={preference === entry.value}
                  className={styles.choice}
                  onClick={() => {
                    setPreference(entry.value);
                  }}
                >
                  {preference === entry.value && <CheckIcon />}
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className={styles.signOut}
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            Abmelden
          </button>
        </div>
      )}
    </span>
  );
}
