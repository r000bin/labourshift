import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Swiss baseline parameters (SECO/BFS/SNB 2024–25) ───────────────────────
const SWISS = {
  adults: 7e6,
  workforce: 5300,          // thousands
  gdp: 854,                 // CHF bn
  unemploymentBase: 0.051,  // ILO rate
  medianWage: 7024,         // CHF/month
  debtGDP: 0.405,
  taxRevenue: 190,          // CHF bn
  govtSpendingGDP: 0.313,
  directDemocracyBuffer: 15, // resilience points (V-Dem #1 participatory democracy)
  vereineBuffer: 10,         // resilience points (100K+ associations, 55% participation)
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function clamp(v, lo = 10, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

// ─── Simulation engine ───────────────────────────────────────────────────────
// Models societal resilience indices (0–100) as unemployment rises and
// policy investments are applied. Calibrated to research from Jahoda (1933),
// Paul & Moser (2009), Marienthal study, China Shock, and Swiss macro data.

function runSimulation(params, years = 15) {
  const {
    peakUnemployment, rampYears, ubiAmount, aiRevenue,
    communityInvestment, learningInvestment, mentalHealthInvestment, hoursReduction,
  } = params;

  const data = [];
  let debtGDP = SWISS.debtGDP;
  let cumulativeCost = 0;

  for (let year = 0; year <= years; year++) {
    // Unemployment ramps to peak over rampYears, then plateaus
    const rawUnemp = year < rampYears
      ? SWISS.unemploymentBase + (peakUnemployment - SWISS.unemploymentBase) * year / rampYears
      : peakUnemployment;

    // Work sharing absorbs some displacement (elasticity −0.45, research range −0.4 to −0.6)
    const effectiveUnemp = Math.max(SWISS.unemploymentBase, rawUnemp - hoursReduction * 0.45);
    const gap = effectiveUnemp - SWISS.unemploymentBase;

    // ── Fiscal ──────────────────────────────────────
    const ubiNetCost = Math.max(0, (ubiAmount * 12 * SWISS.adults) / 1e9 - 15);
    const hoursCost = SWISS.gdp * 0.008 * hoursReduction;
    const policyCost = ubiNetCost + communityInvestment + learningInvestment + mentalHealthInvestment + hoursCost;
    const alvCost = gap * 100 * 2.45; // CHF bn per 1pp unemployment
    const gdpFactor = Math.max(0.5, 1 - gap * 0.8);
    const revenue = SWISS.taxRevenue * gdpFactor + aiRevenue;
    const spending = SWISS.govtSpendingGDP * SWISS.gdp * gdpFactor + alvCost + policyCost;
    const balance = revenue - spending;
    cumulativeCost += policyCost + alvCost;
    debtGDP = Math.max(0.20, debtGDP - balance / (SWISS.gdp * gdpFactor));

    // ── UBI income replacement ratio (0–1) ──────────
    const ubiOffset = Math.min(1, ubiAmount / (SWISS.medianWage * 0.6));

    // ── Policy effects with maturation lags ─────────
    // Learning: 2-year lag (ALMP research), community: 1-year lag, mental health: 1-year lag
    const lLearn = year >= 2 ? 1 : year >= 1 ? 0.4 : 0.1;
    const lComm = year >= 1 ? 1 : 0.3;
    const lMH = year >= 1 ? 1 : 0.5;
    const learnEff = lLearn * Math.min(20, learningInvestment * 1.8);
    const commEff = lComm * Math.min(15, communityInvestment * 2.5);
    const mhEff = lMH * Math.min(20, mentalHealthInvestment * 2.5);

    // ── Societal indices (0–100) ─────────────────────
    const materialSecurity = clamp(
      85 - gap * 200 * (1 - ubiOffset * 0.7) + communityInvestment * 0.8, 10, 95
    );
    const purposeIndex = clamp(75 - gap * 200 + learnEff + commEff, 10, 90);
    const mentalHealth = clamp(80 - gap * 200 + mhEff + commEff * 0.5 + ubiOffset * 6, 10, 90);
    const socialCohesion = clamp(
      85 - gap * 160
      + (gap > 0 ? SWISS.vereineBuffer * 0.3 : 0)
      + Math.min(12, communityInvestment * 2)
      + Math.min(5, mentalHealthInvestment * 0.7)
      + ubiOffset * 5,
      10, 95
    );
    const demoStability = clamp(
      95 - gap * 150
      + (gap > 0 ? SWISS.directDemocracyBuffer * 0.5 : 0)
      + Math.min(8, communityInvestment * 1.5)
      + ubiOffset * 8,
      20, 99
    );
    const wellbeing = materialSecurity * 0.3 + purposeIndex * 0.25 + socialCohesion * 0.2 + mentalHealth * 0.25;

    // ── Jahoda latent functions of employment (0–100) ─
    const jahodaTime = clamp(80 - gap * 200 + learnEff * 1.5 + commEff * 1.2);
    const jahodaSocial = clamp(85 - gap * 150 + commEff * 1.8 + (gap > 0 ? SWISS.vereineBuffer * 0.5 : 0));
    const jahodaPurpose = clamp(70 - gap * 200 + learnEff * 1.2 + commEff * 1.5);
    const jahodaStatus = clamp(75 - gap * 250 + ubiOffset * 15 + learnEff);
    const jahodaActivity = clamp(80 - gap * 180 + learnEff * 1.5 + commEff + hoursReduction * 50);

    data.push({
      year: 2025 + year, unemployment: +(effectiveUnemp * 100).toFixed(1),
      wellbeing: +wellbeing.toFixed(1), materialSecurity: +materialSecurity.toFixed(1),
      purposeIndex: +purposeIndex.toFixed(1), socialCohesion: +socialCohesion.toFixed(1),
      mentalHealth: +mentalHealth.toFixed(1), demoStability: +demoStability.toFixed(1),
      fiscalBalance: +balance.toFixed(1), debtGDP: +(debtGDP * 100).toFixed(1),
      policyCost: +policyCost.toFixed(1), cumulativeCost: +cumulativeCost.toFixed(1),
      jahodaTime, jahodaSocial, jahodaPurpose, jahodaStatus, jahodaActivity,
    });
  }
  return data;
}

// ─── Color palette ───────────────────────────────────────────────────────────
const C = {
  bg: "#0a0e1a", panel: "#0f1628", border: "#1e2d4a",
  accent: "#e8c84a", red: "#e84a4a", green: "#4ae8a0",
  blue: "#4a9fe8", muted: "#4a5a7a", text: "#c8d4e8", textDim: "#6a7a9a",
};

// ─── Chart tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ color: C.accent, fontWeight: 700, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Slider ──────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, format, sublabel }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: C.text, fontSize: 12, fontFamily: "monospace" }}>{label}</span>
        <span style={{ color: C.accent, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>
          {format ? format(value) : value}
        </span>
      </div>
      {sublabel && <div style={{ color: C.textDim, fontSize: 10, marginBottom: 4 }}>{sublabel}</div>}
      <div style={{ position: "relative", height: 4, background: C.border, borderRadius: 2 }}>
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.1s" }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ position: "absolute", top: -6, left: 0, width: "100%", height: 16, opacity: 0, cursor: "pointer" }}
        />
      </div>
    </div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KPI({ label, value, unit, delta, good }) {
  const isPositive = delta > 0;
  const color = delta === 0 ? C.text : (good ? (isPositive ? C.green : C.red) : (isPositive ? C.red : C.green));
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ color: C.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
        {value}<span style={{ fontSize: 12, color: C.textDim }}> {unit}</span>
      </div>
      {delta !== undefined && (
        <div style={{ color, fontSize: 11, marginTop: 4 }}>
          {isPositive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}{unit} vs baseline
        </div>
      )}
    </div>
  );
}

// ─── Main app ────────────────────────────────────────────────────────────────
export default function SwissDigitalTwin() {
  const [params, setParams] = useState({
    peakUnemployment: 0.25,
    rampYears: 8,
    ubiAmount: 1500,
    aiRevenue: 10,
    communityInvestment: 3,
    learningInvestment: 5,
    mentalHealthInvestment: 3,
    hoursReduction: 0.10,
  });
  const [activeChart, setActiveChart] = useState("wellbeing");
  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }));

  // Three scenarios: with investment, no investment, baseline (no shock)
  const simWithPolicy = runSimulation(params);
  const noInvParams = {
    ...params, ubiAmount: 0, aiRevenue: 0,
    communityInvestment: 0, learningInvestment: 0,
    mentalHealthInvestment: 0, hoursReduction: 0,
  };
  const simNoPolicy = runSimulation(noInvParams);
  const simBaseline = runSimulation({
    ...noInvParams, peakUnemployment: SWISS.unemploymentBase,
  });

  // Merge data for chart comparison
  const chartData = simWithPolicy.map((d, i) => ({
    ...d,
    wellbeingNP: simNoPolicy[i].wellbeing,
    cohesionNP: simNoPolicy[i].socialCohesion,
    demoNP: simNoPolicy[i].demoStability,
    mhNP: simNoPolicy[i].mentalHealth,
    purposeNP: simNoPolicy[i].purposeIndex,
    fiscalNP: simNoPolicy[i].fiscalBalance,
  }));

  const final = simWithPolicy[simWithPolicy.length - 1];
  const finalBase = simBaseline[simBaseline.length - 1];
  const finalNP = simNoPolicy[simNoPolicy.length - 1];

  // Jahoda bar chart data (final year comparison)
  const jahodaData = [
    { name: "Time Structure", "With Investment": final.jahodaTime, "No Investment": finalNP.jahodaTime },
    { name: "Social Contact", "With Investment": final.jahodaSocial, "No Investment": finalNP.jahodaSocial },
    { name: "Collective Purpose", "With Investment": final.jahodaPurpose, "No Investment": finalNP.jahodaPurpose },
    { name: "Status & Identity", "With Investment": final.jahodaStatus, "No Investment": finalNP.jahodaStatus },
    { name: "Enforced Activity", "With Investment": final.jahodaActivity, "No Investment": finalNP.jahodaActivity },
  ];

  const charts = {
    wellbeing: {
      label: "Wellbeing",
      lines: [
        { key: "wellbeing", name: "With Investment", color: C.green },
        { key: "wellbeingNP", name: "No Investment", color: C.red },
      ],
      yDomain: [0, 100],
      desc: "Composite index (0\u2013100): material security 30%, purpose 25%, mental health 25%, social cohesion 20%. Swiss baseline \u2248 82.",
    },
    resilience: {
      label: "Social Resilience",
      lines: [
        { key: "socialCohesion", name: "Social Cohesion", color: C.green },
        { key: "demoStability", name: "Democratic Stability", color: C.blue },
        { key: "cohesionNP", name: "Cohesion (No Inv.)", color: C.red },
      ],
      yDomain: [0, 100],
      desc: "Social cohesion driven by Vereine, trust, community bonds. Democratic stability reflects Swiss direct democracy buffer (+15 pts). Calibrated to Marienthal, China Shock, and Weimar evidence.",
    },
    health: {
      label: "Health & Purpose",
      lines: [
        { key: "mentalHealth", name: "Mental Health", color: C.blue },
        { key: "purposeIndex", name: "Purpose & Meaning", color: C.accent },
        { key: "mhNP", name: "Mental Health (No Inv.)", color: C.red },
      ],
      yDomain: [0, 100],
      desc: "Mental health calibrated to Paul & Moser meta-analysis (d=0.51, 237 studies). Purpose index based on Jahoda\u2019s latent deprivation theory. Both improve with 1\u20132 year lag after investment begins.",
    },
    fiscal: {
      label: "Fiscal",
      lines: [
        { key: "fiscalBalance", name: "With Investment", color: C.accent },
        { key: "fiscalNP", name: "No Investment", color: C.muted },
      ],
      yDomain: ['auto', 'auto'],
      desc: "Annual fiscal balance (CHF bn). AI revenue (SWF, automation tax) offsets shrinking traditional tax base. Swiss debt brake (Art. 126 BV, 85% voter approval) constrains sustained deficits.",
    },
    jahoda: {
      label: "Jahoda Functions",
      type: "bar",
      desc: "Marie Jahoda (Marienthal study, 1933) identified five latent functions of employment beyond income. Bars show how well each function is provided at year 2040 with vs. without resilience investment.",
    },
  };

  const activeChartDef = charts[activeChart];
  const displacedWorkers = Math.round(params.peakUnemployment * SWISS.workforce);

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: C.text, padding: "clamp(12px, 3vw, 24px)",
    }}>
      <style>{`
        .main-grid { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
        @media (max-width: 768px) { .main-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: 3, textTransform: "uppercase" }}>
            ◆ Swiss Digital Twin
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>/ Post-Work Society Simulator</div>
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(16px, 4vw, 22px)", fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
          Living With High Unemployment
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.textDim, maxWidth: 700 }}>
          Not how to prevent unemployment — how to build societal resilience infrastructure for when it arrives.
          Calibrated to Swiss data (SECO/BFS/SNB 2024–25) and research from Jahoda, Paul &amp; Moser, Acemoglu &amp; Restrepo.
        </p>
      </div>

      <div className="main-grid">

        {/* ── Left panel: controls ── */}
        <div>
          {/* Displacement scenario */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              DISPLACEMENT SCENARIO
            </div>
            <Slider
              label="Peak Unemployment"
              value={params.peakUnemployment}
              min={0.05} max={0.40} step={0.01}
              onChange={set("peakUnemployment")}
              format={v => `${Math.round(v * 100)}%`}
              sublabel={`\u2248 ${displacedWorkers.toLocaleString()}k workers displaced`}
            />
            <Slider
              label="Onset Speed"
              value={params.rampYears}
              min={2} max={15} step={1}
              onChange={set("rampYears")}
              format={v => `${v} years`}
              sublabel="Slower onset = more time to adapt"
            />
          </div>

          {/* Income security */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              INCOME SECURITY
            </div>
            <Slider
              label="UBI Amount"
              value={params.ubiAmount}
              min={0} max={3500} step={100}
              onChange={set("ubiAmount")}
              format={v => v === 0 ? "None" : `CHF ${v.toLocaleString()}/mo`}
              sublabel="Swiss 2016 referendum proposed CHF 2,500/mo (rejected 77%)"
            />
            <Slider
              label="AI Revenue (SWF + Tax)"
              value={params.aiRevenue}
              min={0} max={30} step={1}
              onChange={set("aiRevenue")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Sovereign wealth fund dividends, automation tax, data royalties"
            />
          </div>

          {/* Social infrastructure */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              SOCIAL INFRASTRUCTURE
            </div>
            <Slider
              label="Community & Vereine"
              value={params.communityInvestment}
              min={0} max={10} step={0.5}
              onChange={set("communityInvestment")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Community centres, makerspaces, libraries, civic participation"
            />
            <Slider
              label="Lifelong Learning"
              value={params.learningInvestment}
              min={0} max={15} step={0.5}
              onChange={set("learningInvestment")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Bildung, reskilling, university expansion (current: CHF 5.3 bn)"
            />
            <Slider
              label="Mental Health"
              value={params.mentalHealthInvestment}
              min={0} max={10} step={0.5}
              onChange={set("mentalHealthInvestment")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Community mental health, peer support, prevention"
            />
          </div>

          {/* Work redistribution */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              WORK REDISTRIBUTION
            </div>
            <Slider
              label="Hours Reduction"
              value={params.hoursReduction}
              min={0} max={0.30} step={0.01}
              onChange={set("hoursReduction")}
              format={v => v === 0 ? "None" : `${Math.round(v * 100)}%`}
              sublabel="Iceland/UK 4-day week trials: productivity maintained or improved"
            />
          </div>
        </div>

        {/* ── Right panel: charts & KPIs ── */}
        <div>
          {/* KPI bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <KPI
              label="Wellbeing (2040)"
              value={final.wellbeing.toFixed(1)}
              unit="/100"
              delta={final.wellbeing - finalBase.wellbeing}
              good={true}
            />
            <KPI
              label="Cohesion (2040)"
              value={final.socialCohesion.toFixed(1)}
              unit="/100"
              delta={final.socialCohesion - finalBase.socialCohesion}
              good={true}
            />
            <KPI
              label="Dem. Stability (2040)"
              value={final.demoStability.toFixed(1)}
              unit="/100"
              delta={final.demoStability - finalBase.demoStability}
              good={true}
            />
            <KPI
              label="Debt/GDP (2040)"
              value={final.debtGDP.toFixed(1)}
              unit="%"
              delta={final.debtGDP - finalBase.debtGDP}
              good={false}
            />
          </div>

          {/* Chart selector tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {Object.entries(charts).map(([key, chart]) => (
              <button
                key={key}
                onClick={() => setActiveChart(key)}
                style={{
                  background: activeChart === key ? C.accent : "transparent",
                  color: activeChart === key ? C.bg : C.textDim,
                  border: `1px solid ${activeChart === key ? C.accent : C.border}`,
                  borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                  fontSize: 11, fontWeight: activeChart === key ? 700 : 400,
                  fontFamily: "monospace", transition: "all 0.15s",
                }}
              >
                {chart.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 12 }}>
              {activeChartDef.desc}
            </div>
            {activeChartDef.type === "bar" ? (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={jahodaData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="name" stroke={C.textDim} fontSize={10} interval={0} />
                  <YAxis stroke={C.textDim} fontSize={11} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                  <Bar dataKey="With Investment" fill={C.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="No Investment" fill={C.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="year" stroke={C.textDim} fontSize={11} />
                  <YAxis stroke={C.textDim} fontSize={11} domain={activeChartDef.yDomain} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                  {activeChartDef.lines.map(line => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      name={line.name}
                      stroke={line.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      strokeDasharray={line.name.includes("No") ? "5 5" : undefined}
                    />
                  ))}
                  {activeChart === "fiscal" && (
                    <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Investment summary */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              INVESTMENT SUMMARY
            </div>
            <div style={{ color: C.textDim, fontSize: 11 }}>
              Annual policy cost: <span style={{ color: C.accent }}>CHF {final.policyCost.toFixed(1)} bn</span>
              {" \u00b7 "}
              AI revenue: <span style={{ color: C.accent }}>CHF {params.aiRevenue} bn</span>
              {" \u00b7 "}
              Effective unemployment: <span style={{ color: C.accent }}>{final.unemployment}%</span>
              {" \u00b7 "}
              Cumulative cost: <span style={{ color: C.accent }}>CHF {final.cumulativeCost.toFixed(0)} bn</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, textAlign: "center" }}>
        <div style={{ color: C.textDim, fontSize: 10 }}>
          LabourShift — Swiss Post-Work Society Resilience Simulator · Calibrated to SECO/BFS/SNB 2024–25 data
        </div>
      </div>
    </div>
  );
}
