import { useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DropZone } from '../components/DropZone';
import { EmptyState } from '../components/EmptyState';
import { Hint } from '../components/Hint';
import { List, ListRow } from '../components/List';
import { Popover } from '../components/Popover';
import { StatusBadge } from '../components/StatusBadge';
import { Switch } from '../components/Switch';
import { TextField } from '../components/TextField';
import { TextLink } from '../components/TextLink';
import { Wordmark } from '../components/Wordmark';
import { useTheme, type ThemePreference } from '../theme/useTheme';
import styles from './DesignSystemPage.module.css';

/**
 * Every base component in every state, so the design can be held against the running
 * application by eye — the half of this story that green tests cannot show.
 *
 * The three appearance buttons below are deliberately NOT a reusable switcher: the one in
 * the profile menu belongs to HAN-26, and building it here would hand that story a
 * component it did not design. They call setPreference directly and live in this file.
 */

const PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.state}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

export function DesignSystemPage() {
  const { preference, resolved, setPreference } = useTheme();
  const [protectedOn, setProtectedOn] = useState(true);
  const [copied, setCopied] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Designsystem</h1>
        <p className={styles.lead}>
          Alle Bauteile in allen Zuständen, aus denselben Tokens wie die Anwendung.
        </p>
      </header>

      <Section title="Erscheinungsbild">
        <div role="radiogroup" aria-label="Erscheinungsbild" className={styles.appearance}>
          {PREFERENCES.map((entry) => (
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
              {entry.label}
            </button>
          ))}
        </div>
        <p className={styles.note}>
          Gewählt: {preference} · auf dem Bildschirm: {resolved}
        </p>
      </Section>

      <Section title="Marke">
        <State label="Wortmarke">
          <Wordmark />
        </State>
        <State label="nur Zeichen">
          <Wordmark markOnly />
        </State>
      </Section>

      <Section title="Schaltflächen">
        <State label="accent">
          <Button>Veröffentlichen</Button>
        </State>
        <State label="secondary">
          <Button variant="secondary">Datei auswählen</Button>
        </State>
        <State label="quiet">
          <Button variant="quiet">Umbenennen</Button>
        </State>
        <State label="critical">
          <Button variant="critical">Löschen</Button>
        </State>
        <State label="gesperrt">
          <Button variant="critical" disabled>
            Löschen
          </Button>
        </State>
        <State label="48 px · Passwortseite">
          <Button size="lg">Öffnen</Button>
        </State>
      </Section>

      <Section title="Textlink">
        <State label="Ruhe">
          <TextLink>Ersetzen</TextLink>
        </State>
        <State label="stark">
          <TextLink strong>Prototyp Kundenportal</TextLink>
        </State>
        <State label="mono">
          <TextLink mono href="#adresse">
            handout.example.de/f8k2p9
          </TextLink>
        </State>
        <State label="nur Symbol · bestätigt">
          {copied ? (
            <TextLink
              label="Adresse kopieren"
              confirmation="Kopiert"
              onClick={() => {
                setCopied(false);
              }}
            />
          ) : (
            <TextLink
              label="Adresse kopieren"
              onClick={() => {
                setCopied(true);
              }}
            >
              Kopieren
            </TextLink>
          )}
        </State>
      </Section>

      <Section title="Eingabefelder und Schalter">
        <State label="Standard mit Hinweis">
          <TextField
            label="Name"
            defaultValue="Prototyp Kundenportal"
            hint="Kommt aus dem Dateinamen, überschreibbar."
          />
        </State>
        <State label="ungültig">
          <TextField label="Passwort" type="password" error="Passwort stimmt nicht." />
        </State>
        <State label="gesperrt">
          <TextField label="Adresse" mono defaultValue="handout.example.de/f8k2p9" disabled />
        </State>
        <State label="Pflichtfeld">
          <TextField label="Name" required />
        </State>
        <State label="Schalter">
          <Switch label="Mit Passwort schützen" checked={protectedOn} onChange={setProtectedOn} />
        </State>
        <State label="Schalter gesperrt">
          <Switch label="Passwortschutz" checked={false} disabled onChange={() => undefined} />
        </State>
      </Section>

      <Section title="Zustand">
        <State label="geschützt">
          <StatusBadge glyph="lock-closed">Geschützt</StatusBadge>
        </State>
        <State label="offen">
          <StatusBadge variant="warning" glyph="lock-open">
            Offen
          </StatusBadge>
        </State>
        <State label="veröffentlicht">
          <StatusBadge>Veröffentlicht</StatusBadge>
        </State>
        <State label="absolute Pfade">
          <StatusBadge variant="warning" glyph="exclamation">
            Absolute Pfade
          </StatusBadge>
        </State>
        <State label="nicht entpackt">
          <StatusBadge variant="error">Nicht entpackt</StatusBadge>
        </State>
      </Section>

      <Section title="Hinweis">
        <State label="neutral">
          <Hint>Kommt aus dem Dateinamen, überschreibbar.</Hint>
        </State>
        <State label="Fehler">
          <Hint variant="error">Bitte eine Datei auswählen.</Hint>
        </State>
      </Section>

      <Section title="Liste">
        <div className={styles.wide}>
          <List aria-label="Veröffentlichungen">
            <ListRow>Prototyp Kundenportal · handout.example.de/f8k2p9</ListRow>
            <ListRow href="#eintrag">Schulungsunterlagen Modul 2</ListRow>
            <ListRow onClick={() => undefined}>Designsystem-Dokumentation</ListRow>
          </List>
        </div>
      </Section>

      <Section title="Popover">
        <State label="Schutz verwalten">
          <Popover
            triggerLabel="Geschützt — Schutz verwalten"
            triggerContent={<StatusBadge glyph="lock-closed">Geschützt</StatusBadge>}
            heading="Prototyp Kundenportal"
          >
            <Switch label="Passwortschutz" checked={protectedOn} onChange={setProtectedOn} />
            <TextField label="Passwort" mono defaultValue="kiesel-3555" readOnly />
            <Button variant="secondary">Neues Passwort erzeugen</Button>
          </Popover>
        </State>
      </Section>

      <Section title="Ablegefläche">
        <div className={styles.wide}>
          <State label="Ruhe · über der Fläche (ablegen zum Ausprobieren)">
            <DropZone fileName="prototyp-kundenportal.zip" />
          </State>
          <State label="Fortschritt">
            <DropZone state="busy" busyLabel="Entpacken · 118 Dateien" progress={64} />
          </State>
          <State label="Fehler">
            <DropZone
              state="error"
              message="Das Zip enthält keine index.html."
              recovery="Andere Datei ablegen oder auswählen."
            />
          </State>
        </div>
      </Section>

      <Section title="Karte und Leerzustand">
        <div className={styles.wide}>
          <State label="Karte">
            <Card>
              <p className={styles.cardTitle}>Karte</p>
              <p className={styles.note}>
                Fläche für zusammengehörige Angaben. Kontur statt Schatten.
              </p>
            </Card>
          </State>
          <State label="Leerzustand">
            <EmptyState action={<Button>Datei ablegen</Button>}>
              Noch nichts veröffentlicht.
            </EmptyState>
          </State>
        </div>
      </Section>
    </div>
  );
}
