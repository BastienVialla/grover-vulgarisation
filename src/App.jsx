import { useState, useRef, useEffect } from "react";

// ── Grover amplitude simulation ────────────────────────────────────────────
function initAmplitudes(n) {
  return new Array(n).fill(1 / Math.sqrt(n));
}

function applyOracle(amps, target) {
  return amps.map((a, i) => (i === target ? -a : a));
}

function applyDiffusion(amps) {
  const mean = amps.reduce((s, a) => s + a, 0) / amps.length;
  return amps.map((a) => 2 * mean - a);
}

function optimalSteps(n) {
  return Math.max(1, Math.round((Math.PI / 4) * Math.sqrt(n)));
}

function successProbAtStep(n, k) {
  const theta = Math.asin(1 / Math.sqrt(n));
  return Math.sin((2 * k + 1) * theta) ** 2;
}

function randomTarget(n) {
  return Math.floor(Math.random() * n);
}

const SIZES = [8, 16, 32];

// ── Sub-components ─────────────────────────────────────────────────────────

function GridCard({ index, isTarget, isRevealed, isFound, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isRevealed}
      style={{
        width: "100%",
        aspectRatio: "1",
        minWidth: 0,
        border: isFound
          ? "2px solid #f59e0b"
          : isRevealed
          ? "1px solid #374151"
          : "1px solid #4b5563",
        borderRadius: 8,
        background: isFound
          ? "rgba(245,158,11,0.15)"
          : isRevealed && !isTarget
          ? "#111827"
          : isRevealed && isTarget
          ? "rgba(245,158,11,0.2)"
          : "rgba(55,65,81,0.4)",
        cursor: isRevealed || disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        transition: "all 0.2s",
        boxShadow: isFound ? "0 0 16px rgba(245,158,11,0.4)" : "none",
        transform: isFound ? "scale(1.08)" : "scale(1)",
        padding: 0,
      }}
    >
      {isRevealed ? (
        isTarget ? (
          <span style={{ fontSize: 20 }}>★</span>
        ) : (
          <span style={{ color: "#6b7280", fontSize: 11 }}>{index + 1}</span>
        )
      ) : (
        <span style={{ color: "#6b7280", fontSize: 10 }}>?</span>
      )}
    </button>
  );
}

// Bar height encodes AMPLITUDE (can be negative); the small number is the
// PROBABILITY (amplitude squared). Positive bars rise from the zero line,
// negative bars hang below it.
function AmplitudeBar({ amplitude, probability, isFound, isWrong, showLabel }) {
  const pct = Math.min(50, Math.abs(amplitude) * 50); // 50% of box = |amp| 1
  const isNeg = amplitude < -1e-9;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}>
      <div style={{ width: "100%", height: 80, position: "relative" }}>
        {/* Zero line */}
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#374151" }} />
        {/* Amplitude bar — positive grows UP from the zero line, negative DOWN */}
        <div
          style={{
            position: "absolute",
            left: "12%",
            right: "12%",
            ...(isNeg ? { top: "50%" } : { bottom: "50%" }),
            height: `${pct}%`,
            background: isFound
              ? "linear-gradient(180deg,#fcd34d,#f59e0b)"
              : isWrong
              ? "linear-gradient(180deg,#f87171,#dc2626)"
              : isNeg
              ? "linear-gradient(180deg,#a78bfa,#7c3aed)"
              : "linear-gradient(0deg,#60a5fa,#3b82f6)",
            borderRadius: 3,
            transition: "all 0.6s cubic-bezier(0.34,1.2,0.64,1)",
            boxShadow: isFound
              ? "0 0 8px rgba(245,158,11,0.5)"
              : isWrong
              ? "0 0 8px rgba(220,38,38,0.5)"
              : isNeg
              ? "0 0 8px rgba(124,58,237,0.5)"
              : "0 0 4px rgba(59,130,246,0.3)",
          }}
        />
      </div>
      {showLabel && (
        <div
          style={{
            fontSize: 9,
            color: isFound ? "#f59e0b" : isWrong ? "#f87171" : "#6b7280",
            fontFamily: "'Courier New', monospace",
            fontWeight: isFound || isWrong ? "bold" : "normal",
          }}
        >
          {(probability * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function ClassicalProbBar({ probability, isRevealed, isFound, showLabel }) {
  const pct = probability * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0 }}>
      <div style={{ width: "100%", height: 80, position: "relative" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "#374151" }} />
        <div
          style={{
            position: "absolute",
            left: "12%",
            right: "12%",
            bottom: 0,
            height: `${pct}%`,
            background: isFound
              ? "linear-gradient(0deg,#fcd34d,#f59e0b)"
              : isRevealed
              ? "transparent"
              : "linear-gradient(0deg,#d97706,#f59e0b)",
            borderRadius: "3px 3px 0 0",
            transition: "height 0.5s cubic-bezier(0.34,1.2,0.64,1)",
            boxShadow: isFound ? "0 0 8px rgba(245,158,11,0.5)" : "none",
          }}
        />
      </div>
      {showLabel && (
        <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "'Courier New', monospace" }}>
          {isRevealed && !isFound ? "—" : `${pct.toFixed(0)}%`}
        </div>
      )}
    </div>
  );
}

// Probability of measuring ★ as a function of Grover steps: a sine-squared
// curve. Makes the "sweet spot" and over-rotation visible.
function ProbCurve({ n, step, optimal }) {
  const W = 260;
  const H = 64;
  const padL = 8, padR = 8, padT = 8, padB = 14;
  const maxK = Math.max(Math.ceil(optimal * 2.4), 6);
  const xOf = (k) => padL + (k / maxK) * (W - padL - padR);
  const yOf = (p) => H - padB - p * (H - padT - padB);

  const pts = [];
  for (let k = 0; k <= maxK + 1e-9; k += maxK / 120) {
    pts.push(`${xOf(k).toFixed(1)},${yOf(successProbAtStep(n, k)).toFixed(1)}`);
  }
  const curStep = Math.min(step, maxK);
  const curP = successProbAtStep(n, curStep);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`Chance of measuring the target versus number of Grover steps. Best at about ${optimal} steps.`}
      >
        {/* baseline + 100% line */}
        <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="#374151" strokeWidth="1" />
        <line x1={padL} y1={yOf(1)} x2={W - padR} y2={yOf(1)} stroke="#1f2937" strokeWidth="1" strokeDasharray="2 3" />
        {/* sweet spot marker */}
        <line x1={xOf(optimal)} y1={padT} x2={xOf(optimal)} y2={H - padB} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        <text x={xOf(optimal)} y={H - 3} fontSize="8" fill="#f59e0b" textAnchor="middle" fontFamily="monospace">
          best ≈ {optimal}
        </text>
        {/* the curve */}
        <polyline points={pts.join(" ")} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
        {/* you are here */}
        <circle cx={xOf(curStep)} cy={yOf(curP)} r="3.5" fill="#f9fafb" stroke="#06b6d4" strokeWidth="1.5" />
      </svg>
      <div style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace", textAlign: "center", marginTop: 2 }}>
        chance of measuring ★ vs. steps — collapse too late and it falls again
      </div>
    </div>
  );
}

function ScoreRow({ label, classical, quantum, n }) {
  const denom = Math.max(n, classical, quantum, 1);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
      <span style={{ color: "#9ca3af", width: 60, fontSize: 11, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 18, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(100, (classical / denom) * 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg,#f59e0b,#d97706)",
            borderRadius: 4,
            transition: "width 0.4s",
            display: "flex",
            alignItems: "center",
            paddingLeft: 6,
          }}
        >
          <span style={{ fontSize: 10, color: "#000", fontWeight: "bold" }}>{classical > 0 ? classical : ""}</span>
        </div>
      </div>
      <div style={{ flex: 1, height: 18, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(100, (quantum / denom) * 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg,#06b6d4,#0891b2)",
            borderRadius: 4,
            transition: "width 0.4s",
            display: "flex",
            alignItems: "center",
            paddingLeft: 6,
          }}
        >
          <span style={{ fontSize: 10, color: "#000", fontWeight: "bold" }}>{quantum > 0 ? quantum : ""}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function GroverViz() {
  const [n, setN] = useState(16);
  const [target, setTarget] = useState(() => randomTarget(16));
  const [phase, setPhase] = useState("intro"); // intro | running

  // Classical state
  const [classicalRevealed, setClassicalRevealed] = useState([]);
  const [classicalDone, setClassicalDone] = useState(false);

  // Quantum state
  const [amplitudes, setAmplitudes] = useState(() => initAmplitudes(16));
  const [quantumStep, setQuantumStep] = useState(0); // completed Grover iterations = oracle queries
  const [subPhase, setSubPhase] = useState("idle"); // idle | oracle | diffusion
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedResult, setCollapsedResult] = useState(null);
  const [quantumSolved, setQuantumSolved] = useState(false);
  const [priorQueries, setPriorQueries] = useState(0); // queries spent on earlier (failed) runs this round

  // History of completed rounds: { c, q, n }
  const [history, setHistory] = useState([]);

  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const optimal = optimalSteps(n);
  const animating = subPhase !== "idle";
  const queriesThisRun = quantumStep;
  const totalQuantumQueries = priorQueries + queriesThisRun;

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function startNewRound(newN) {
    clearTimers();
    const size = newN ?? n;
    setTarget(randomTarget(size));
    setClassicalRevealed([]);
    setClassicalDone(false);
    setAmplitudes(initAmplitudes(size));
    setQuantumStep(0);
    setSubPhase("idle");
    setCollapsed(false);
    setCollapsedResult(null);
    setQuantumSolved(false);
    setPriorQueries(0);
    setPhase("running");
  }

  function handleNChange(newN) {
    setN(newN);
    setHistory([]); // averages across different N would be meaningless
    startNewRound(newN);
  }

  function recordHistory(c, q) {
    setHistory((h) => [...h.slice(-9), { c, q, n }]);
  }

  // Classical: open a box. One click = one lookup.
  function handleClassicalFlip(cardIndex) {
    if (classicalDone || classicalRevealed.includes(cardIndex)) return;
    const newRevealed = [...classicalRevealed, cardIndex];
    setClassicalRevealed(newRevealed);
    if (cardIndex === target) {
      setClassicalDone(true);
      if (quantumSolved) recordHistory(newRevealed.length, totalQuantumQueries);
    }
  }

  // Quantum: one Grover iteration = one oracle query, shown in two phases so
  // the negative amplitude and the reflection around the average are visible.
  function handleGroverStep() {
    if (collapsed || animating) return;
    const afterOracle = applyOracle(amplitudes, target);
    setAmplitudes(afterOracle);
    setSubPhase("oracle");
    timers.current.push(
      setTimeout(() => {
        setAmplitudes(applyDiffusion(afterOracle));
        setSubPhase("diffusion");
        timers.current.push(
          setTimeout(() => {
            setSubPhase("idle");
            setQuantumStep((s) => s + 1);
          }, 900)
        );
      }, 1300)
    );
  }

  // Quantum: measure. Weighted random draw over |amplitude|².
  function handleCollapse() {
    if (collapsed || animating) return;
    const probs = amplitudes.map((a) => a * a);
    const total = probs.reduce((s, p) => s + p, 0);
    let r = Math.random() * total;
    let result = probs.length - 1;
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r <= 0) {
        result = i;
        break;
      }
    }
    setCollapsed(true);
    setCollapsedResult(result);
    if (result === target) {
      setQuantumSolved(true);
      if (classicalDone) recordHistory(classicalRevealed.length, totalQuantumQueries);
    }
  }

  // Wrong measurement isn't fatal — re-prepare the superposition and try
  // again, keeping the running total of oracle queries for this round.
  function handleRetry() {
    if (!collapsed || collapsedResult === target) return;
    setPriorQueries((p) => p + quantumStep);
    setAmplitudes(initAmplitudes(n));
    setQuantumStep(0);
    setCollapsed(false);
    setCollapsedResult(null);
  }

  // Fast-forward: simulate 10 full rounds (classical random order vs. quantum
  // run at the optimal step count, re-running on a failed measurement).
  function simulateRounds(count = 10) {
    const pSuccess = successProbAtStep(n, optimal);
    const rows = [];
    for (let i = 0; i < count; i++) {
      const c = Math.floor(Math.random() * n) + 1; // target's position in a random opening order
      let q = 0;
      do {
        q += optimal;
      } while (Math.random() >= pSuccess && q < n * 4);
      rows.push({ c, q, n });
    }
    setHistory((h) => [...h, ...rows].slice(-10));
  }

  const probabilities = amplitudes.map((a) => a * a);
  const meanAmp = amplitudes.reduce((s, a) => s + a, 0) / amplitudes.length;
  const showBarLabels = n <= 16;
  const gridCols = n === 8 ? 4 : 8;

  const panelStyle = {
    flex: "1 1 320px",
    minWidth: 0,
    background: "rgba(17,24,39,0.8)",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const quantumStatus = () => {
    if (subPhase === "oracle")
      return (
        <>
          <strong style={{ color: "#a78bfa" }}>Oracle:</strong> ★'s amplitude just flipped negative — and no box was opened to do it.
        </>
      );
    if (subPhase === "diffusion")
      return (
        <>
          <strong style={{ color: "#60a5fa" }}>Diffusion:</strong> every bar reflected around the average (dashed line). The negative one lands highest.
        </>
      );
    if (collapsed) {
      return collapsedResult === target ? (
        <>✓ Measured the correct answer after <strong style={{ color: "#06b6d4" }}>{totalQuantumQueries}</strong> oracle quer{totalQuantumQueries === 1 ? "y" : "ies"}.</>
      ) : (
        <>✗ Measured the wrong item — that's the gamble of measuring at {(successProbAtStep(n, quantumStep) * 100).toFixed(0)}% odds. Re-prepare and try again (aim for ~{optimal} steps).</>
      );
    }
    if (quantumStep === 0) return <>All {n} boxes equally likely (1/{n} each). Apply Grover steps to pile probability onto ★ — without opening anything.</>;
    if (quantumStep < optimal)
      return <>Step {quantumStep}/{optimal} — ★ is now at {(probabilities[target] * 100).toFixed(1)}%. Keep going.</>;
    if (quantumStep === optimal)
      return <>✦ Sweet spot! ★ is at {(probabilities[target] * 100).toFixed(1)}%. Measure now for the best odds.</>;
    return <>Over-rotated (step {quantumStep}): ★ has fallen back to {(probabilities[target] * 100).toFixed(1)}%. The curve below shows why.</>;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#030712",
        color: "#f9fafb",
        fontFamily: "'Georgia', serif",
        padding: "24px 16px",
        backgroundImage:
          "radial-gradient(ellipse at 20% 50%, rgba(6,182,212,0.04) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.04) 0%, transparent 50%)",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#06b6d4", textTransform: "uppercase", marginBottom: 8, fontFamily: "'Courier New', monospace" }}>
          Quantum vs Classical
        </div>
        <h1 style={{ fontSize: 28, fontWeight: "normal", margin: 0, letterSpacing: -0.5 }}>Grover's Search Algorithm</h1>
        <p style={{ color: "#6b7280", fontSize: 13, maxWidth: 540, margin: "8px auto 0" }}>
          Find the hidden ★. Classically, you open boxes one by one. The quantum computer never opens a box — it uses interference to pile probability onto the answer.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>Boxes N =</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => handleNChange(s)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: n === s ? "1px solid #06b6d4" : "1px solid #374151",
                background: n === s ? "rgba(6,182,212,0.1)" : "transparent",
                color: n === s ? "#06b6d4" : "#9ca3af",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => startNewRound()}
          style={{
            padding: "4px 18px",
            borderRadius: 6,
            border: "1px solid #374151",
            background: "rgba(255,255,255,0.03)",
            color: "#d1d5db",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ↺ New round
        </button>
        {phase !== "intro" && (
          <button
            onClick={() => simulateRounds(10)}
            title="Instantly play 10 rounds: classical opens boxes in random order; quantum runs the optimal number of steps and re-runs if the measurement misses."
            style={{
              padding: "4px 18px",
              borderRadius: 6,
              border: "1px solid #374151",
              background: "rgba(255,255,255,0.03)",
              color: "#d1d5db",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ▶ Simulate 10 rounds
          </button>
        )}
      </div>

      {phase === "intro" && (
        <div style={{ textAlign: "center", marginTop: 32, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6 }}>
            A star ★ is hidden in one of {n} closed boxes. You'll hunt for it twice, side by side: once the classical way (open boxes until you find it) and once the quantum way (reshape the odds, then measure once).
          </p>
          <p style={{ color: "#6b7280", fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
            Watch the bars: classical probability only moves when a box is eliminated. Quantum amplitudes start moving from the very first step — with every box still closed.
          </p>
          <button
            onClick={() => startNewRound()}
            style={{
              marginTop: 20,
              padding: "12px 32px",
              borderRadius: 10,
              border: "1px solid #06b6d4",
              background: "rgba(6,182,212,0.1)",
              color: "#06b6d4",
              cursor: "pointer",
              fontSize: 16,
              letterSpacing: 1,
            }}
          >
            Begin
          </button>
        </div>
      )}

      {phase !== "intro" && (
        <>
          {/* Target info */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div
              style={{
                textAlign: "center",
                padding: "10px 20px",
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 10,
              }}
            >
              <span style={{ color: "#9ca3af", fontSize: 12, fontFamily: "monospace" }}>
                <span style={{ color: "#fcd34d", fontSize: 14 }}>★</span> hidden among{" "}
                <strong style={{ color: "#f9fafb" }}>{n}</strong> boxes · classical average ~
                <strong style={{ color: "#f59e0b" }}>{Math.round((n + 1) / 2)}</strong> lookups · quantum sweet spot ~
                <strong style={{ color: "#06b6d4" }}>{optimal}</strong> steps (≈ π⁄4·√N)
              </span>
            </div>
          </div>

          {/* Side-by-side panels */}
          <div style={{ display: "flex", gap: 16, maxWidth: 960, margin: "0 auto", flexWrap: "wrap" }}>
            {/* Classical Panel */}
            <div style={{ ...panelStyle, borderColor: classicalDone ? "rgba(245,158,11,0.3)" : "#1f2937" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace" }}>
                    Classical
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>O(N) · open boxes one by one</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 28, color: classicalDone ? "#f59e0b" : "#f9fafb", lineHeight: 1 }}>
                    {classicalRevealed.length}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>boxes opened</div>
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#6b7280", margin: 0, minHeight: 32 }}>
                {classicalDone
                  ? `Found in ${classicalRevealed.length} lookup${classicalRevealed.length !== 1 ? "s" : ""}. The long-run average is ~${Math.round((n + 1) / 2)}.`
                  : `Click any box to open it. ${classicalRevealed.length}/${n} opened — each miss spreads the odds over fewer boxes.`}
              </p>

              {/* Box grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: 6,
                  maxWidth: gridCols * 58,
                  margin: "0 auto",
                  width: "100%",
                }}
              >
                {Array.from({ length: n }).map((_, i) => (
                  <GridCard
                    key={i}
                    index={i}
                    isTarget={i === target}
                    isRevealed={classicalRevealed.includes(i)}
                    isFound={classicalRevealed.includes(i) && i === target}
                    onClick={() => handleClassicalFlip(i)}
                    disabled={classicalDone}
                  />
                ))}
              </div>

              {/* Classical probability bars */}
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 8px", border: "1px solid #111827" }}>
                <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace", marginBottom: 8, textAlign: "center" }}>
                  probability per box — all bars move together, in equal steps
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${n}, 1fr)`,
                    gap: n > 16 ? 2 : 4,
                  }}
                >
                  {Array.from({ length: n }).map((_, i) => {
                    const revealedMiss = classicalRevealed.includes(i) && i !== target;
                    const remaining = n - classicalRevealed.filter((j) => j !== target).length;
                    const prob = classicalDone ? (i === target ? 1 : 0) : revealedMiss ? 0 : 1 / remaining;
                    return (
                      <ClassicalProbBar
                        key={i}
                        probability={prob}
                        isRevealed={revealedMiss}
                        isFound={classicalDone && i === target}
                        showLabel={showBarLabels}
                      />
                    );
                  })}
                </div>
              </div>

              {classicalDone && (
                <div style={{ textAlign: "center", padding: "4px 0", color: "#f59e0b", fontFamily: "monospace", fontSize: 13, letterSpacing: 1 }}>
                  ★ Found by elimination
                </div>
              )}
            </div>

            {/* Quantum Panel */}
            <div style={{ ...panelStyle, borderColor: quantumSolved ? "rgba(6,182,212,0.3)" : "#1f2937" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#06b6d4", letterSpacing: 3, textTransform: "uppercase", fontFamily: "monospace" }}>
                    Quantum
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>O(√N) · Grover's algorithm</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 28, color: quantumSolved ? "#06b6d4" : "#f9fafb", lineHeight: 1 }}>
                    {queriesThisRun}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                    oracle queries{priorQueries > 0 ? ` (+${priorQueries} earlier)` : ""}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, minHeight: 32, transition: "color 0.3s" }}>{quantumStatus()}</p>

              {/* Amplitude bars */}
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 8px", border: "1px solid #111827" }}>
                <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace", marginBottom: 8, textAlign: "center" }}>
                  bar height = amplitude (↑ positive, ↓ negative) · number = chance
                </div>
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${n}, 1fr)`,
                      gap: n > 16 ? 2 : 4,
                    }}
                  >
                    {amplitudes.map((amp, i) => {
                      const isCollapsedResult = collapsed && collapsedResult === i;
                      return (
                        <AmplitudeBar
                          key={i}
                          amplitude={collapsed ? (isCollapsedResult ? 1 : 0) : amp}
                          probability={collapsed ? (isCollapsedResult ? 1 : 0) : amp * amp}
                          isFound={isCollapsedResult && collapsedResult === target}
                          isWrong={isCollapsedResult && collapsedResult !== target}
                          showLabel={showBarLabels}
                        />
                      );
                    })}
                  </div>
                  {/* Average line — the axis the diffusion step reflects around */}
                  {animating && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: `${(0.5 - Math.max(-1, Math.min(1, meanAmp)) / 2) * 80}px`,
                        borderTop: "1px dashed #fcd34d",
                        opacity: 0.85,
                        transition: "top 0.4s",
                        pointerEvents: "none",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          right: 0,
                          top: -14,
                          fontSize: 9,
                          color: "#fcd34d",
                          fontFamily: "monospace",
                          background: "rgba(3,7,18,0.8)",
                          padding: "0 3px",
                          borderRadius: 3,
                        }}
                      >
                        average
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Probability-vs-steps curve */}
              {!collapsed && (
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 8px 6px", border: "1px solid #111827" }}>
                  <ProbCurve n={n} step={quantumStep} optimal={optimal} />
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleGroverStep}
                  disabled={collapsed || animating}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: collapsed || animating ? "1px solid #374151" : "1px solid #3b82f6",
                    background: collapsed || animating ? "transparent" : "rgba(59,130,246,0.08)",
                    color: collapsed || animating ? "#4b5563" : "#60a5fa",
                    cursor: collapsed || animating ? "default" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {animating ? (subPhase === "oracle" ? "oracle…" : "diffusion…") : "⊕ Grover step"}
                </button>
                {collapsed && collapsedResult !== target ? (
                  <button
                    onClick={handleRetry}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      border: "1px solid #f87171",
                      background: "rgba(248,113,113,0.08)",
                      color: "#f87171",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    ↻ Re-prepare & retry
                  </button>
                ) : (
                  <button
                    onClick={handleCollapse}
                    disabled={collapsed || animating}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      border: collapsed || animating ? "1px solid #374151" : "1px solid #06b6d4",
                      background: collapsed || animating ? "transparent" : "rgba(6,182,212,0.08)",
                      color: collapsed || animating ? "#4b5563" : "#06b6d4",
                      cursor: collapsed || animating ? "default" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    ◉ Collapse / measure
                  </button>
                )}
              </div>

              {/* Oracle disclaimer — the #1 question a newcomer asks */}
              <p style={{ fontSize: 11, color: "#4b5563", margin: 0, fontStyle: "italic", lineHeight: 1.5 }}>
                "If the oracle knows where ★ is, why not just ask it?" — It doesn't <em>know</em>. Like a lock that clicks only for the right key, it can recognize ★ when all possibilities pass through it at once, but it can't point to it. Grover turns that faint click into a near-certainty.
              </p>
            </div>
          </div>

          {/* History / Scoreboard */}
          {history.length > 0 && (
            <div
              style={{
                maxWidth: 960,
                margin: "20px auto 0",
                background: "rgba(17,24,39,0.8)",
                border: "1px solid #1f2937",
                borderRadius: 16,
                padding: "16px 20px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: "4px 12px", marginBottom: 8 }}>
                <div />
                <div style={{ fontSize: 11, color: "#f59e0b", fontFamily: "monospace", letterSpacing: 2 }}>CLASSICAL LOOKUPS</div>
                <div style={{ fontSize: 11, color: "#06b6d4", fontFamily: "monospace", letterSpacing: 2 }}>ORACLE QUERIES</div>
              </div>
              {history.map((row, i) => (
                <ScoreRow key={i} label={`Round ${i + 1}`} classical={row.c} quantum={row.q} n={row.n} />
              ))}
              <div style={{ marginTop: 10, fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>
                Avg classical:{" "}
                <span style={{ color: "#f59e0b" }}>{(history.reduce((s, r) => s + r.c, 0) / history.length).toFixed(1)}</span>{" "}
                (theory ~{Math.round((n + 1) / 2)}) · Avg quantum:{" "}
                <span style={{ color: "#06b6d4" }}>{(history.reduce((s, r) => s + r.q, 0) / history.length).toFixed(1)}</span>{" "}
                (theory ~{optimal}) · Same units: one bar segment = one question asked of the data.
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{ maxWidth: 960, margin: "16px auto 0", display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { color: "#f59e0b", label: "Classical probability (uniform over unopened boxes)" },
              { color: "#3b82f6", label: "Amplitude, positive (above the zero line)" },
              { color: "#7c3aed", label: "Amplitude, negative — flipped by the oracle" },
              { color: "#fcd34d", label: "Found / collapsed state · dashed line = average" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>

          {/* Conceptual note */}
          <div style={{ maxWidth: 960, margin: "16px auto 0", fontSize: 12, color: "#4b5563", textAlign: "center", fontStyle: "italic" }}>
            The quantum advantage isn't "trying everything at once" — it's <em style={{ color: "#6b7280" }}>interference</em>: the oracle flips ★ negative, diffusion reflects everything around the average, and ★ rises while the rest sink. Repeat ~{optimal} times, then measure.
          </div>
        </>
      )}
    </div>
  );
}
