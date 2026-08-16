const ITEMS = [
  "Monad Testnet (10143)",
  "10,000 TPS",
  "1s finality",
  "World ID v4",
  "MCP agents",
  "A2A claim DEX",
  "1 slot / human",
];

export function ProofBar() {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <div className="border-y-[3px] border-ink py-3">
      <div className="landing-marquee">
        <div className="landing-marquee-track">
          {loop.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="pill shrink-0 bg-[#161224] text-ink"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
