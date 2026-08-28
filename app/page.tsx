export default function Home() {
  return (
    <main
      style={{
        maxWidth: "var(--page-max)",
        margin: "0 auto",
        padding: "calc(var(--space-unit) * 6) calc(var(--space-unit) * 3)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--display-1)",
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        {"<apparatus"}
        <span style={{ color: "var(--rubric)" }}>{"/"}</span>
        {">"}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-mono)",
          color: "var(--ink-2)",
          marginTop: "calc(var(--space-unit) * 2)",
        }}
      >
        LACUNA — nothing recorded here yet.
      </p>
    </main>
  );
}
