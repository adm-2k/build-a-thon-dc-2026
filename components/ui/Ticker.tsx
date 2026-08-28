import type { TickerEvent } from "@/lib/engine/schemas";
import styles from "./ticker.module.css";

/**
 * Ticker — DESIGN-BRIEF §6. Hub only, max one per page.
 * Dumb marquee: renders the events it is handed; no data fetching here.
 * Item format per SPEC §5: `N°01 · 14 CLAIMS COLLATED`.
 */
export type TickerItem = Pick<TickerEvent, "instrument" | "verb" | "count">;

function itemText(e: TickerItem): string {
  const count = e.count != null ? `${e.count} ` : "";
  return `N°${e.instrument} · ${count}${e.verb}`;
}

export function Ticker({ events }: { events: TickerItem[] }) {
  if (events.length === 0) return null;
  const sequence = (ariaHidden: boolean) => (
    <span className={styles.sequence} aria-hidden={ariaHidden || undefined}>
      {events.map((e, i) => (
        <span key={i} className={styles.item}>
          {itemText(e)}
          <span className={styles.separator} aria-hidden="true">
            {"  ///"}
          </span>
        </span>
      ))}
    </span>
  );
  return (
    <div className={styles.strip} role="status" aria-label="Event ticker">
      <div className={styles.track}>
        {sequence(false)}
        {sequence(true)}
      </div>
    </div>
  );
}
