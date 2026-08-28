import Link from "next/link";
import { Colophon } from "@/components/ui/Colophon";
import { FolioHeader } from "@/components/ui/FolioHeader";
import { InstrumentNumber, MicroLabel } from "@/components/ui/MicroLabel";
import { Ticker, type TickerItem } from "@/components/ui/Ticker";
import styles from "./page.module.css";

/** The wordmark — the name set as a self-closing XML element (§2). */
function Wordmark() {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: "var(--text-lead)",
        letterSpacing: "-0.02em",
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      {"<apparatus"}
      <span style={{ color: "var(--rubric)" }}>{"/"}</span>
      {">"}
    </span>
  );
}

const tickerEvents: TickerItem[] = [
  { instrument: "01", verb: "SCAFFOLD FIXED IN THE RECORD" },
  { instrument: "02", verb: "SCAFFOLD FIXED IN THE RECORD" },
  { instrument: "03", verb: "LACUNA — FUTURE WORK" },
];

export default function Home() {
  return (
    <>
      <Ticker events={tickerEvents} />
      <div className={styles.container}>
        <FolioHeader
          left={<Wordmark />}
          right={
            <>
              <MicroLabel tone="dim">The catalogue</MicroLabel>
              <MicroLabel tone="dim">2026-08-28</MicroLabel>
            </>
          }
        />

        <main>
          <section
            style={{
              padding:
                "calc(var(--space-unit) * 8) 0 calc(var(--space-unit) * 8)",
            }}
          >
            <h1 className={styles.thesis}>
              Markup and manuscript,{" "}
              <span className={styles.rubricated}>printed in register</span>.
            </h1>
            <p className={styles.lead}>Instruments for reading closely.</p>
          </section>

          <section aria-labelledby="catalogue-heading">
            <MicroLabel
              tone="dim"
              as="h2"
              style={{
                display: "block",
                marginBottom: "calc(var(--space-unit) * 2)",
              }}
            >
              <span id="catalogue-heading">Catalogue</span>
            </MicroLabel>

            <div className={styles.grid}>
              <Link href="/tracer" className={styles.cell}>
                <div className={styles.cellTop}>
                  <InstrumentNumber n="01" />
                  <span className={styles.arrow} aria-hidden="true">
                    {"→"}
                  </span>
                </div>
                <p className={styles.name}>Tracer</p>
                <p className={styles.function}>
                  Paste a text; its atomic claims are collated, given their
                  logical form, and traced to sources.
                </p>
                <p className={styles.status}>
                  LACUNA — nothing recorded here yet.
                </p>
              </Link>

              <Link href="/map" className={styles.cell}>
                <div className={styles.cellTop}>
                  <InstrumentNumber n="02" />
                  <span className={styles.arrow} aria-hidden="true">
                    {"→"}
                  </span>
                </div>
                <p className={styles.name}>Map</p>
                <p className={styles.function}>
                  A contested question; 5–8 sources clustered by stance into a
                  typed disagreement graph.
                </p>
                <p className={styles.status}>
                  LACUNA — nothing recorded here yet.
                </p>
              </Link>

              <Link href="/begriffs" className={`${styles.cell} ${styles.greyed}`}>
                <div className={styles.cellTop}>
                  <InstrumentNumber n="03" tone="dim" />
                </div>
                <p className={styles.name}>Begriffs</p>
                <p className={styles.function}>
                  A term; its etymology chain and a century-interval frequency
                  panel.
                </p>
                <p className={styles.status}>LACUNA — future work.</p>
              </Link>
            </div>
          </section>
        </main>

        <Colophon spin />
      </div>
    </>
  );
}
