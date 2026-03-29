import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Swiss baseline parameters (SECO/BFS/SNB 2024–25) ───────────────────────
const SWISS = {
  adults: 7e6,
  workforce: 5.3e6,           // total workforce
  gdp: 854,                   // CHF bn
  unemploymentBase: 0.051,    // ILO rate
  medianWage: 7024,           // CHF/month
  consumptionShare: 0.51,     // household consumption / GDP (World Bank 2023)
  debtGDP: 0.405,
  taxRevenue: 190,            // CHF bn
  govtSpendingGDP: 0.313,
  exportShare: 0.67,          // exports/GDP
  alvReplacementRate: 0.75,   // ALV pays 70-80% of salary
  alvDurationMonths: 18,
};

// ─── Coefficients from research ─────────────────────────────────────────────
const COEFF = {
  // Okun's law: GDP loss per 1pp unemployment (structural shock, IMF Ball et al. 2013)
  okunGDP: 2.0,
  // MPC of displaced workers (IMF, Jappelli & Pistaferri)
  mpcUnemployed: 0.85,
  // MPC of UBI recipients (higher than average, credit-constrained)
  mpcTransfer: 0.85,
  // MPC of employed (Swiss estimate)
  mpcEmployed: 0.45,
  // Business cascade: demand drops cause firm closures causing more unemployment
  // (Bilbiie, Ghironi & Melitz: 20-40% amplification)
  cascadeAmplifier: 0.25,
  // Hysteresis: annual skill depreciation reduces re-employment probability
  hysteresisRate: 0.04,       // 4%/year (NBER/LSE)
  // Tax revenue elasticity (blended, IMF WP/14/110)
  taxElasticity: 1.05,
  // Fiscal multiplier at ZLB (Auerbach & Gorodnichenko)
  fiscalMultiplierZLB: 1.3,
  // CHF safe-haven appreciation during global shock
  chfAppreciation: 0.12,      // 12% (based on 2015 episode)
  // Export hit per 10% CHF appreciation
  exportElasticity: 0.5,      // 5% exports lost per 10% appreciation
  // Employment elasticity to hours reduction (Kapteyn et al., Hunt 1999)
  hoursElasticity: 0.45,
  // ALMP: unemployment reduction per CHF bn spent (Card et al. 2018)
  almEfficiency: 0.12,        // pp per CHF bn, with lag
  // Labour supply reduction from UBI (Jaimovich et al.)
  ubiLabourElasticity: 0.15,
  // ALV cost per 1pp unemployment (SECO)
  alvCostPerPP: 2.45,         // CHF bn
  // Okun feedback: how much new unemployment each 1% GDP contraction creates
  // Standard Swiss Okun is 0.22 (cyclical). Structural shocks are worse:
  // firms permanently close, not just reduce hours. Use 0.5 for AI shock.
  okunFeedback: 0.5,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmt(v, d = 1) { return typeof v === 'number' ? v.toFixed(d) : v; }

// ─── Simulation engine: models the demand death spiral ──────────────────────
// Unemployment is a COMPOUNDING STATE VARIABLE. Each year:
//   1. AI displaces workers (exogenous shock, ramps over time)
//   2. Previous spiral-induced unemployment carries forward
//   3. Total unemployed lose income → consumption drops
//   4. Consumption crash → GDP contracts → businesses fail → MORE unemployment
//   5. That new unemployment feeds back into step 3 next year
//
// Policy tools break the spiral by maintaining consumption (UBI),
// redistributing work (hours reduction), reskilling (ALMP), and
// funding it all (AI revenue / SWF).

function runSimulation(params, years = 15) {
  const {
    peakDisplacement, rampYears, ubiAmount, aiRevenue,
    almSpending, hoursReduction, corporateTaxRate,
  } = params;

  const data = [];
  let debtGDP = SWISS.debtGDP;
  let cumulativeCost = 0;

  // STATE: spiral-induced unemployment accumulates year over year
  let spiralUnemp = 0;
  // STATE: long-term unemployed (subset, harder to re-employ)
  let longTermShare = 0;

  for (let year = 0; year <= years; year++) {
    // ── Step 1: Primary AI displacement (exogenous shock) ───────
    const aiDisplacement = year < rampYears
      ? (peakDisplacement - SWISS.unemploymentBase) * year / rampYears
      : (peakDisplacement - SWISS.unemploymentBase);

    // ── Step 2: Work sharing absorbs some displacement ──────────
    // Elasticity -0.45: 10% fewer hours → 4.5% more jobs (Kapteyn, Hunt)
    const sharedJobs = hoursReduction * COEFF.hoursElasticity;

    // ── Step 3: ALMP/retraining pulls people back (2-year lag) ──
    const almLag = year >= 3 ? 1 : year >= 2 ? 0.6 : year >= 1 ? 0.2 : 0;
    const almReduction = almLag * almSpending * COEFF.almEfficiency / 100;

    // ── Step 4: Total unemployment = AI shock + spiral carryover - mitigations ─
    const totalUnempRate = clamp(
      SWISS.unemploymentBase + aiDisplacement + spiralUnemp - sharedJobs - almReduction,
      SWISS.unemploymentBase, 0.70
    );
    const gap = totalUnempRate - SWISS.unemploymentBase;
    const displacedWorkers = gap * SWISS.workforce;

    // ── Step 5: Income loss → consumption crash ─────────────────
    const annualWage = SWISS.medianWage * 12;
    // ALV covers 75% but only for 18 months. As unemployment persists,
    // more people exhaust benefits. Model: coverage decays with long-term share.
    const alvEffective = SWISS.alvReplacementRate * (1 - longTermShare * 0.8);
    const grossIncomeLost = displacedWorkers * annualWage / 1e9;
    const incomeLostAfterALV = grossIncomeLost * (1 - alvEffective);

    // UBI replaces some lost income for displaced workers
    const ubiTotalCost = ubiAmount * 12 * SWISS.adults / 1e9;
    const ubiNetCost = Math.max(0, ubiTotalCost - 15); // absorbs existing transfers
    const ubiForDisplaced = ubiAmount * 12 * displacedWorkers / 1e9;
    const netIncomeLost = Math.max(0, incomeLostAfterALV - ubiForDisplaced);

    // Consumption crash: displaced workers have high MPC (0.85)
    const consumptionLoss = netIncomeLost * COEFF.mpcUnemployed;

    // Employed workers also cut spending from fear/uncertainty (confidence channel)
    const fearMultiplier = 1 + clamp(gap * 0.5, 0, 0.3); // up to 30% amplification
    const totalConsumptionLoss = consumptionLoss * fearMultiplier;

    // ── Step 6: GDP contraction ─────────────────────────────────
    const consumptionGDPHit = totalConsumptionLoss / SWISS.gdp;

    // Business failure cascade: 25% amplification (Bilbiie, Ghironi & Melitz)
    // Accelerates past 10% unemployment (credit tightening threshold)
    const cascadeRate = gap > 0.10
      ? COEFF.cascadeAmplifier * 1.5
      : COEFF.cascadeAmplifier;
    const cascadeHit = consumptionGDPHit * cascadeRate;

    // CHF safe-haven appreciation hurts exports
    const chfHit = COEFF.chfAppreciation * COEFF.exportElasticity * SWISS.exportShare
      * Math.min(1, year / Math.max(1, rampYears));

    // Total GDP impact
    const totalGDPHit = consumptionGDPHit + cascadeHit + chfHit;
    const gdpFactor = clamp(1 - totalGDPHit, 0.40, 1.0);
    const gdp = SWISS.gdp * gdpFactor;

    // ── Step 7: THE SPIRAL — GDP contraction creates NEW unemployment ─
    // Okun's Law inverse: 1% GDP decline → ~0.5pp unemployment (structural shock)
    // Standard Okun is 0.22 for Switzerland cyclically, but structural shocks
    // are worse because firms permanently close, not just reduce hours.
    // We use the FULL GDP hit (consumption + cascade + CHF), not just cascade.
    const newSpiralUnemp = totalGDPHit * COEFF.okunFeedback;

    // ── Step 8: Hysteresis — long-term unemployment trap ────────
    // Each year of unemployment, skills depreciate (4%/yr, NBER/LSE),
    // callback rates drop 50% after 12 months (audit studies).
    // This makes the spiral "sticky" — even if the shock eases, damage persists.
    if (year > 0) {
      longTermShare = clamp(
        longTermShare * 0.92 + gap * 0.18, // 18% of unemployed become long-term each year
        0, 0.65
      );
    }
    // Hysteresis adds unemployment: long-term unemployed block recovery
    const hysteresisUnemp = longTermShare * COEFF.hysteresisRate * 2;

    // ── Step 9: Update spiral state for NEXT year ───────────────
    // New spiral unemployment = demand-driven + hysteresis
    // Decays 20% per year naturally (some adaptation) but new damage accumulates
    spiralUnemp = clamp(
      spiralUnemp * 0.80 + newSpiralUnemp + hysteresisUnemp,
      0, 0.40
    );

    // ── Step 10: Fiscal accounting ──────────────────────────────
    const taxRevenue = SWISS.taxRevenue * Math.pow(gdpFactor, COEFF.taxElasticity);
    const aiTaxRevenue = aiRevenue + (corporateTaxRate / 100) * gdp * 0.15;
    const alvCost = gap * 100 * COEFF.alvCostPerPP;
    const hoursCost = SWISS.gdp * 0.005 * hoursReduction * 100;
    const policyCost = ubiNetCost + almSpending + hoursCost;
    const totalRevenue = taxRevenue + aiTaxRevenue;
    const totalSpending = SWISS.govtSpendingGDP * gdp + alvCost + policyCost;
    const fiscalBalance = totalRevenue - totalSpending;
    cumulativeCost += policyCost + alvCost;
    debtGDP = clamp(debtGDP - fiscalBalance / gdp, 0.10, 3.0);

    // ── Step 11: Consumption level (CHF bn) ─────────────────────
    const baselineConsumption = SWISS.gdp * SWISS.consumptionShare;
    const actualConsumption = gdp * SWISS.consumptionShare
      + ubiTotalCost * COEFF.mpcTransfer * 0.4;

    // ── Compile ─────────────────────────────────────────────────
    data.push({
      year: 2025 + year,
      // Unemployment breakdown
      primaryUnemp: +((SWISS.unemploymentBase + aiDisplacement) * 100).toFixed(1),
      effectiveUnemp: +(totalUnempRate * 100).toFixed(1),
      spiralAdded: +(spiralUnemp * 100).toFixed(1),
      longTermUnemp: +(longTermShare * 100).toFixed(1),
      // Economic metrics
      gdp: +gdp.toFixed(1),
      gdpChange: +((gdpFactor - 1) * 100).toFixed(1),
      consumption: +actualConsumption.toFixed(1),
      consumptionBaseline: +baselineConsumption.toFixed(1),
      consumptionLoss: +totalConsumptionLoss.toFixed(1),
      // Fiscal
      taxRevenue: +totalRevenue.toFixed(1),
      fiscalBalance: +fiscalBalance.toFixed(1),
      debtGDP: +(debtGDP * 100).toFixed(1),
      policyCost: +policyCost.toFixed(1),
      alvCost: +alvCost.toFixed(1),
      cumulativeCost: +cumulativeCost.toFixed(1),
      // Income
      incomeLost: +grossIncomeLost.toFixed(1),
      incomeReplaced: +(grossIncomeLost - netIncomeLost).toFixed(1),
      displacedK: Math.round(displacedWorkers / 1000),
    });
  }
  return data;
}

// ─── Color palette ──────────────────────────────────────────────────────────
const C = {
  bg: "#0a0e1a", panel: "#0f1628", border: "#1e2d4a",
  accent: "#e8c84a", red: "#e84a4a", green: "#4ae8a0",
  blue: "#4a9fe8", purple: "#a855f7", orange: "#f59e0b",
  muted: "#4a5a7a", text: "#c8d4e8", textDim: "#6a7a9a",
};

// ─── Chart tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ color: C.accent, fontWeight: 700, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Slider ─────────────────────────────────────────────────────────────────
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

// ─── KPI card ───────────────────────────────────────────────────────────────
function KPI({ label, value, unit, delta, good }) {
  const d = parseFloat(delta);
  const isPositive = d > 0;
  const color = !d ? C.text : (good ? (isPositive ? C.green : C.red) : (isPositive ? C.red : C.green));
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ color: C.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
        {value}<span style={{ fontSize: 12, color: C.textDim }}> {unit}</span>
      </div>
      {delta !== undefined && (
        <div style={{ color, fontSize: 11, marginTop: 4 }}>
          {isPositive ? "+" : ""}{fmt(d)}{unit} vs no-policy
        </div>
      )}
    </div>
  );
}

// ─── Spiral diagram ─────────────────────────────────────────────────────────
function SpiralDiagram({ data }) {
  const d = data[Math.min(8, data.length - 1)]; // show year 8 state
  const steps = [
    { label: "AI Displacement", value: `${d.primaryUnemp}% unemployed`, color: C.red },
    { label: "Lost Income", value: `CHF ${d.incomeLost} bn/yr`, color: C.orange },
    { label: "Consumption Crash", value: `CHF −${d.consumptionLoss} bn`, color: C.red },
    { label: "GDP Contraction", value: `${d.gdpChange}%`, color: C.red },
    { label: "Business Failures", value: `+${d.spiralAdded.toFixed(1)}pp more unemployed`, color: C.purple },
    { label: "Tax Revenue Falls", value: `CHF ${d.taxRevenue} bn (was ${SWISS.taxRevenue})`, color: C.orange },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 0, justifyContent: "center", padding: "12px 0" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            background: `${s.color}15`, border: `1px solid ${s.color}40`,
            borderRadius: 8, padding: "8px 12px", textAlign: "center", minWidth: 120,
          }}>
            <div style={{ color: s.color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              {s.label}
            </div>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 700, marginTop: 2 }}>
              {s.value}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ color: C.muted, fontSize: 16, padding: "0 4px" }}>{"\u2192"}</div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ color: C.red, fontSize: 14, padding: "0 8px", fontWeight: 700 }}>{"\u21BA"} spiral repeats</div>
      </div>
    </div>
  );
}

// ─── Main app ───────────────────────────────────────────────────────────────
export default function SwissDigitalTwin() {
  const [params, setParams] = useState({
    peakDisplacement: 0.25,
    rampYears: 8,
    ubiAmount: 0,
    aiRevenue: 0,
    almSpending: 0,
    hoursReduction: 0,
    corporateTaxRate: 0,
  });
  const [activeChart, setActiveChart] = useState("spiral");
  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }));

  // Two scenarios: with policies and without
  const simWith = runSimulation(params);
  const simWithout = runSimulation({
    ...params, ubiAmount: 0, aiRevenue: 0, almSpending: 0,
    hoursReduction: 0, corporateTaxRate: 0,
  });
  const simBaseline = runSimulation({
    ...params, peakDisplacement: SWISS.unemploymentBase, ubiAmount: 0,
    aiRevenue: 0, almSpending: 0, hoursReduction: 0, corporateTaxRate: 0,
  });

  // Merge for comparison charts
  const chartData = simWith.map((d, i) => ({
    ...d,
    unempNP: simWithout[i].effectiveUnemp,
    gdpNP: simWithout[i].gdp,
    consumptionNP: simWithout[i].consumption,
    fiscalNP: simWithout[i].fiscalBalance,
    debtNP: simWithout[i].debtGDP,
    gdpBaseline: simBaseline[i].gdp,
    consumptionBase: simBaseline[i].consumption,
  }));

  const final = simWith[simWith.length - 1];
  const finalNP = simWithout[simWithout.length - 1];

  const charts = {
    spiral: {
      label: "The Spiral",
      type: "custom",
      desc: "The demand death spiral: AI displacement \u2192 lost income \u2192 consumption crash \u2192 GDP contraction \u2192 business failures \u2192 MORE unemployment. Each loop makes the next one worse.",
    },
    unemployment: {
      label: "Unemployment",
      lines: [
        { key: "effectiveUnemp", name: "With Policy", color: C.green, dash: false },
        { key: "unempNP", name: "No Policy", color: C.red, dash: true },
        { key: "primaryUnemp", name: "AI Displacement Only", color: C.muted, dash: true },
      ],
      yDomain: [0, 'auto'],
      unit: "%",
      desc: "Total unemployment including spiral effects. 'No Policy' shows how the consumption spiral amplifies the initial AI displacement shock. Policy tools dampen the spiral by maintaining demand.",
    },
    gdp: {
      label: "GDP",
      lines: [
        { key: "gdp", name: "With Policy (CHF bn)", color: C.green, dash: false },
        { key: "gdpNP", name: "No Policy", color: C.red, dash: true },
        { key: "gdpBaseline", name: "Baseline (no shock)", color: C.muted, dash: true },
      ],
      yDomain: ['auto', 'auto'],
      unit: "CHF bn",
      desc: "GDP contraction from the demand spiral. Okun\u2019s Law (Swiss coefficient \u22120.22, IMF 2013): each 1pp unemployment costs ~CHF 1.9 bn GDP. Business cascades amplify by 25% (Bilbiie et al.). CHF appreciation adds export drag.",
    },
    consumption: {
      label: "Consumption",
      lines: [
        { key: "consumption", name: "With Policy", color: C.green, dash: false },
        { key: "consumptionNP", name: "No Policy", color: C.red, dash: true },
        { key: "consumptionBase", name: "Baseline", color: C.muted, dash: true },
      ],
      yDomain: ['auto', 'auto'],
      unit: "CHF bn",
      desc: "Household consumption (51% of Swiss GDP). Displaced workers have MPC of 0.85 \u2014 each CHF lost income = CHF 0.85 less spending. UBI maintains consumption floor, breaking the spiral. Without it, the consumption crash feeds back into more layoffs.",
    },
    fiscal: {
      label: "Fiscal",
      lines: [
        { key: "fiscalBalance", name: "With Policy", color: C.accent, dash: false },
        { key: "fiscalNP", name: "No Policy", color: C.muted, dash: true },
      ],
      yDomain: ['auto', 'auto'],
      unit: "CHF bn",
      refLine: 0,
      desc: "Annual fiscal balance. Tax revenue collapses with GDP (elasticity 1.05). AI/automation tax and SWF dividends partially offset. The debt brake (Art. 126 BV, 85% voter approval) limits sustained deficits \u2014 extraordinary measures need absolute majority + 6-year payback.",
    },
    debt: {
      label: "Debt",
      lines: [
        { key: "debtGDP", name: "With Policy", color: C.accent, dash: false },
        { key: "debtNP", name: "No Policy", color: C.red, dash: true },
      ],
      yDomain: [30, 'auto'],
      unit: "% GDP",
      desc: "Debt-to-GDP ratio. Current: 40.5%. For comparison: Eurozone average ~89%, Japan ~260%. Swiss debt brake has held it under 30% for years. Mass unemployment without new revenue sources forces either austerity (worsening the spiral) or debt accumulation.",
    },
  };

  const activeChartDef = charts[activeChart];
  const displacedK = Math.round(params.peakDisplacement * SWISS.workforce / 1000);
  const hasPolicy = params.ubiAmount > 0 || params.aiRevenue > 0 || params.almSpending > 0 ||
    params.hoursReduction > 0 || params.corporateTaxRate > 0;

  // Preset buttons
  const presets = [
    {
      label: "No intervention",
      values: { ubiAmount: 0, aiRevenue: 0, almSpending: 0, hoursReduction: 0, corporateTaxRate: 0 },
    },
    {
      label: "Kurzarbeit only",
      values: { ubiAmount: 0, aiRevenue: 0, almSpending: 0, hoursReduction: 0.15, corporateTaxRate: 0 },
    },
    {
      label: "UBI + AI tax",
      values: { ubiAmount: 2000, aiRevenue: 8, almSpending: 0, hoursReduction: 0, corporateTaxRate: 3 },
    },
    {
      label: "Full package",
      values: { ubiAmount: 1500, aiRevenue: 10, almSpending: 5, hoursReduction: 0.10, corporateTaxRate: 3 },
    },
  ];

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
            {"\u25C6"} LabourShift
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>/ Swiss AI Displacement Simulator</div>
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(16px, 4vw, 22px)", fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
          The Unemployment Death Spiral
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.textDim, maxWidth: 700 }}>
          AI displacement {"\u2192"} lost income {"\u2192"} consumption crash {"\u2192"} GDP contraction {"\u2192"} business failures {"\u2192"} MORE unemployment.
          How policy tools break the spiral. Calibrated to Swiss data (SECO/BFS/SNB 2024{"\u201325"}) and IMF/OECD research.
        </p>
      </div>

      <div className="main-grid">

        {/* ── Left panel: controls ── */}
        <div>
          {/* Shock scenario */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.red, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              AI DISPLACEMENT SHOCK
            </div>
            <Slider
              label="Peak Displacement"
              value={params.peakDisplacement}
              min={0.05} max={0.40} step={0.01}
              onChange={set("peakDisplacement")}
              format={v => `${Math.round(v * 100)}%`}
              sublabel={`\u2248 ${displacedK.toLocaleString()}k workers lose their jobs`}
            />
            <Slider
              label="Onset Speed"
              value={params.rampYears}
              min={2} max={15} step={1}
              onChange={set("rampYears")}
              format={v => `${v} years`}
              sublabel="Faster = less time for economy to adapt"
            />
          </div>

          {/* Policy presets */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              POLICY PRESETS
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setParams(prev => ({ ...prev, ...p.values }))}
                  style={{
                    background: "transparent", color: C.text, border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                    fontSize: 10, fontFamily: "monospace", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = C.accent; e.target.style.color = C.accent; }}
                  onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.text; }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Income floor */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              BREAK THE SPIRAL: INCOME FLOOR
            </div>
            <Slider
              label="Basic Income (UBI)"
              value={params.ubiAmount}
              min={0} max={3500} step={100}
              onChange={set("ubiAmount")}
              format={v => v === 0 ? "None" : `CHF ${v.toLocaleString()}/mo`}
              sublabel="Maintains consumption. Swiss referendum 2016 proposed CHF 2,500 (rejected 77%)"
            />
          </div>

          {/* Revenue */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              FUND IT: TAX AI PROFITS
            </div>
            <Slider
              label="AI Revenue (SWF + Tax)"
              value={params.aiRevenue}
              min={0} max={25} step={1}
              onChange={set("aiRevenue")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Sovereign wealth fund + data royalties + automation levies"
            />
            <Slider
              label="Corporate AI Surcharge"
              value={params.corporateTaxRate}
              min={0} max={8} step={0.5}
              onChange={set("corporateTaxRate")}
              format={v => v === 0 ? "None" : `${v}%`}
              sublabel="On corporate profits. Risk: FDI flight, cantonal tax competition"
            />
          </div>

          {/* Work sharing & retraining */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              SHARE WORK + RESKILL
            </div>
            <Slider
              label="Hours Reduction"
              value={params.hoursReduction}
              min={0} max={0.25} step={0.01}
              onChange={set("hoursReduction")}
              format={v => v === 0 ? "None" : `${Math.round(v * 100)}%`}
              sublabel="4-day week = 20%. Elasticity -0.45 (Kapteyn et al.): 10% fewer hours = 4.5% more jobs"
            />
            <Slider
              label="Retraining (ALMP)"
              value={params.almSpending}
              min={0} max={15} step={0.5}
              onChange={set("almSpending")}
              format={v => `CHF ${v} bn/yr`}
              sublabel="Denmark spends ~2% GDP. 2-year lag before results (Card et al. 2018)"
            />
          </div>
        </div>

        {/* ── Right panel: charts & KPIs ── */}
        <div>
          {/* KPI bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <KPI
              label={`Unemployment ${2025 + 15}`}
              value={fmt(final.effectiveUnemp)}
              unit="%"
              delta={final.effectiveUnemp - finalNP.effectiveUnemp}
              good={false}
            />
            <KPI
              label={`GDP ${2025 + 15}`}
              value={fmt(final.gdp, 0)}
              unit="CHF bn"
              delta={final.gdp - finalNP.gdp}
              good={true}
            />
            <KPI
              label="Jobs Saved"
              value={`${Math.round((finalNP.effectiveUnemp - final.effectiveUnemp) / 100 * SWISS.workforce / 1000)}k`}
              unit=""
              delta={finalNP.effectiveUnemp - final.effectiveUnemp}
              good={false}
            />
            <KPI
              label={`Debt/GDP ${2025 + 15}`}
              value={fmt(final.debtGDP)}
              unit="%"
              delta={final.debtGDP - finalNP.debtGDP}
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
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 12, lineHeight: 1.5 }}>
              {activeChartDef.desc}
            </div>

            {activeChartDef.type === "custom" ? (
              <>
                <SpiralDiagram data={simWithout} />
                <div style={{ marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="year" stroke={C.textDim} fontSize={11} />
                      <YAxis stroke={C.textDim} fontSize={11} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: C.textDim }} />
                      <Area type="monotone" dataKey="effectiveUnemp" name="With Policy (%)" stroke={C.green} fill={`${C.green}20`} strokeWidth={2} />
                      <Area type="monotone" dataKey="unempNP" name="No Policy (%)" stroke={C.red} fill={`${C.red}20`} strokeWidth={2} strokeDasharray="5 5" />
                      <Area type="monotone" dataKey="primaryUnemp" name="AI Shock Only (%)" stroke={C.muted} fill="transparent" strokeWidth={1} strokeDasharray="3 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {!hasPolicy && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", background: `${C.red}15`,
                    border: `1px solid ${C.red}40`, borderRadius: 8, fontSize: 11, color: C.red,
                  }}>
                    No policy tools active. Use the sliders on the left to see how UBI, AI taxes, work sharing, and retraining break the death spiral.
                  </div>
                )}
              </>
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
                      strokeDasharray={line.dash ? "5 5" : undefined}
                    />
                  ))}
                  {activeChartDef.refLine !== undefined && (
                    <ReferenceLine y={activeChartDef.refLine} stroke={C.muted} strokeDasharray="4 4" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Summary */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              SPIRAL IMPACT ({2025 + 15})
            </div>
            <div style={{ color: C.textDim, fontSize: 11, lineHeight: 1.8 }}>
              <span style={{ color: C.red }}>Without policy:</span>{" "}
              {fmt(finalNP.effectiveUnemp)}% unemployment, GDP CHF {fmt(finalNP.gdp, 0)} bn ({fmt((finalNP.gdp / SWISS.gdp - 1) * 100)}%), {fmt(finalNP.displacedK)}k displaced
              <br />
              {hasPolicy && (
                <>
                  <span style={{ color: C.green }}>With policy:</span>{" "}
                  {fmt(final.effectiveUnemp)}% unemployment, GDP CHF {fmt(final.gdp, 0)} bn ({fmt((final.gdp / SWISS.gdp - 1) * 100)}%), policy cost CHF {fmt(final.policyCost)} bn/yr
                  <br />
                </>
              )}
              <span style={{ color: C.muted }}>The gap is the spiral:</span>{" "}
              the difference between "AI Shock Only" and actual unemployment shows how much the consumption crash amplifies the initial displacement.
            </div>
          </div>

          {/* Source note */}
          <div style={{ marginTop: 12, fontSize: 9, color: C.textDim, lineHeight: 1.6 }}>
            Okun coefficient: IMF Ball, Leigh & Loungani 2013. MPC: IMF, Jappelli & Pistaferri 2014.
            Business cascade: Bilbiie, Ghironi & Melitz. Hours elasticity: Kapteyn et al., Hunt 1999.
            ALMP: Card, Kluve & Weber 2018 meta-analysis. CHF safe-haven: SNB 2015 episode.
            Fiscal multiplier at ZLB: Auerbach & Gorodnichenko. Tax buoyancy: IMF WP/14/110.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, textAlign: "center" }}>
        <div style={{ color: C.textDim, fontSize: 10 }}>
          LabourShift {"\u2014"} Swiss AI Displacement Simulator {"\u00b7"} Calibrated to SECO/BFS/SNB 2024{"\u201325"} data and IMF/OECD research
        </div>
      </div>
    </div>
  );
}
