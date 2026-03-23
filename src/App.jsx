import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── Swiss-calibrated model parameters ────────────────────────────────────────
const SWISS = {
  gdp: 854,           // CHF bn nominal GDP 2024
  workforce: 5300,    // thousands of workers
  unemploymentBase: 0.051, // ILO rate baseline
  laborParticipation: 0.842,
  consumptionShareGDP: 0.52,
  householdSavingsRate: 0.19,
  okunCoefficient: -0.22, // very small — cross-border buffer
  fiscalMultiplier: 0.40,
  alvReplacementRate: 0.75, // 70–80% wage replacement
  alvMaxMonths: 18,
  kurzarbeitReplacementRate: 0.80,
  crossBorderBuffer: 0.076, // 7.6% of workforce = Grenzgänger
  exportShareGDP: 0.72,
  govtSpendingGDP: 0.313,
  debtGDP: 0.405,
  alvCostPerPoint: 2.45, // CHF bn per 1pp unemployment
  socialWelfareBase: 2.5, // CHF bn baseline
  taxRevenueBase: 190,   // CHF bn total govt revenue
  taxElasticityToGDP: 1.6,
  chfSafeHavenAppreciation: 0.04, // 4% CHF strengthening per crisis unit
  exportElasticityFX: -0.8, // exports drop 0.8% per 1% CHF appreciation
  medianWage: 7024, // CHF/month
};

// ─── Simulation engine ────────────────────────────────────────────────────────
function runSimulation(params, years = 15) {
  const {
    displacementRate,
    rampYears,
    policy,
    ubiAmount,
    almPSpendingBn,
    reducedHoursPct,
    kurzarbeitCoverage,
    globalShock,
  } = params;

  const data = [];
  let unemploymentRate = SWISS.unemploymentBase;
  let gdp = SWISS.gdp;
  let debtGDP = SWISS.debtGDP;
  let cumulativeFiscalCost = 0;
  let chfAppreciation = 0;

  for (let year = 0; year <= years; year++) {
    const displacedThisYear = year < rampYears
      ? (displacementRate / rampYears) * SWISS.workforce
      : 0;

    const bufferAbsorption = Math.min(displacedThisYear * 0.30, SWISS.crossBorderBuffer * SWISS.workforce * 0.5);
    const netNewUnemployed = Math.max(0, displacedThisYear - bufferAbsorption);

    let policyUnemploymentReduction = 0;
    let annualFiscalCost = 0;
    let retainingWorkers = 0;

    if (policy === 'kurzarbeit' || policy === 'combined') {
      retainingWorkers = netNewUnemployed * kurzarbeitCoverage;
      policyUnemploymentReduction += retainingWorkers / SWISS.workforce;
      annualFiscalCost += retainingWorkers * (SWISS.medianWage * 12 / 1000) * 0.5 * SWISS.kurzarbeitReplacementRate / 1e6;
    }

    if (policy === 'almp' || policy === 'combined') {
      const almPEffect = year >= 2 ? Math.min(almPSpendingBn / 8, 0.15) * (unemploymentRate - SWISS.unemploymentBase) : 0;
      policyUnemploymentReduction += almPEffect;
      annualFiscalCost += almPSpendingBn;
    }

    if (policy === 'reduced_hours' || policy === 'combined') {
      const hoursEmploymentElasticity = -0.45;
      const employmentGain = reducedHoursPct * Math.abs(hoursEmploymentElasticity);
      policyUnemploymentReduction += employmentGain * (unemploymentRate - SWISS.unemploymentBase);
      annualFiscalCost += gdp * 0.01 * reducedHoursPct * 2;
    }

    if (policy === 'ubi' || policy === 'combined') {
      const ubiAnnualCostBn = (ubiAmount * 12 * 7e6) / 1e9;
      const existingTransferOffset = 15;
      annualFiscalCost += Math.max(0, ubiAnnualCostBn - existingTransferOffset);
      policyUnemploymentReduction += 0.002;
    }

    const rawUnemploymentRate = unemploymentRate + (netNewUnemployed / SWISS.workforce);
    unemploymentRate = Math.max(SWISS.unemploymentBase, rawUnemploymentRate - policyUnemploymentReduction);
    const meanReversion = Math.max(0, unemploymentRate - SWISS.unemploymentBase) * 0.08;
    unemploymentRate = Math.max(SWISS.unemploymentBase, unemploymentRate - meanReversion);

    const unemploymentGap = unemploymentRate - SWISS.unemploymentBase;

    const disposableIncomeLost = unemploymentGap * SWISS.workforce * (SWISS.medianWage * 12) / 1e9;
    const alvOffset = policy !== 'none'
      ? disposableIncomeLost * SWISS.alvReplacementRate * Math.min(1, SWISS.alvMaxMonths / 12)
      : disposableIncomeLost * SWISS.alvReplacementRate * 0.4;
    const netIncomeLost = Math.max(0, disposableIncomeLost - alvOffset);
    const consumptionImpact = netIncomeLost * (1 - SWISS.householdSavingsRate) * SWISS.fiscalMultiplier;

    chfAppreciation = Math.min(0.15, globalShock * 0.06 + unemploymentGap * 0.5);
    const exportImpact = chfAppreciation * Math.abs(SWISS.exportElasticityFX) * SWISS.exportShareGDP * gdp;

    const gdpGrowthBaseline = 0.014;
    const gdpGrowth = gdpGrowthBaseline - (consumptionImpact / gdp) - (exportImpact / gdp) + (year >= 2 ? 0.003 : 0);
    gdp = gdp * (1 + gdpGrowth);

    const taxRevenueGrowth = (gdp / SWISS.gdp - 1) * SWISS.taxElasticityToGDP;
    const taxRevenue = SWISS.taxRevenueBase * (1 + taxRevenueGrowth);
    const alvSpending = SWISS.alvCostPerPoint * unemploymentGap * 100;
    const totalSocialSpending = SWISS.govtSpendingGDP * gdp + alvSpending + annualFiscalCost;
    const fiscalBalance = taxRevenue - totalSocialSpending;
    cumulativeFiscalCost += annualFiscalCost + alvSpending;
    debtGDP = Math.max(0.20, debtGDP - fiscalBalance / gdp);

    const householdConsumption = SWISS.consumptionShareGDP * gdp * (1 - unemploymentGap * 0.12);

    data.push({
      year: 2024 + year,
      unemploymentRate: +(unemploymentRate * 100).toFixed(2),
      gdp: +gdp.toFixed(1),
      gdpGrowth: +(gdpGrowth * 100).toFixed(2),
      householdConsumption: +householdConsumption.toFixed(1),
      fiscalBalance: +fiscalBalance.toFixed(1),
      debtGDP: +(debtGDP * 100).toFixed(1),
      cumulativeCost: +cumulativeFiscalCost.toFixed(1),
      chfAppreciation: +(chfAppreciation * 100).toFixed(1),
      taxRevenue: +taxRevenue.toFixed(1),
      alvSpending: +alvSpending.toFixed(1),
      policySpending: +annualFiscalCost.toFixed(1),
    });
  }
  return data;
}

// ─── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0e1a",
  panel: "#0f1628",
  border: "#1e2d4a",
  accent: "#e8c84a",
  red: "#e84a4a",
  green: "#4ae8a0",
  blue: "#4a9fe8",
  muted: "#4a5a7a",
  text: "#c8d4e8",
  textDim: "#6a7a9a",
};

// ─── Chart tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ color: C.accent, fontWeight: 700, margin: "0 0 6px" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}{p.unit || ''}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Slider ────────────────────────────────────────────────────────────────────
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

// ─── KPI card ──────────────────────────────────────────────────────────────────
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

// ─── Policy selector ───────────────────────────────────────────────────────────
function PolicyBtn({ label, value, current, onClick, desc }) {
  const active = current === value;
  return (
    <button onClick={() => onClick(value)} style={{
      background: active ? C.accent : C.panel,
      color: active ? C.bg : C.text,
      border: `1px solid ${active ? C.accent : C.border}`,
      borderRadius: 8, padding: "8px 12px", cursor: "pointer",
      fontSize: 11, fontWeight: active ? 700 : 400,
      transition: "all 0.15s", textAlign: "left",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 9, opacity: 0.7 }}>{desc}</div>
    </button>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function SwissDigitalTwin() {
  const [params, setParams] = useState({
    displacementRate: 0.15,
    rampYears: 8,
    policy: 'alv',
    ubiAmount: 1500,
    almPSpendingBn: 8,
    reducedHoursPct: 0.10,
    kurzarbeitCoverage: 0.60,
    globalShock: 0.3,
  });

  const [activeChart, setActiveChart] = useState("unemployment");

  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }));

  const simWithPolicy = runSimulation(params);
  const simNoPolicy = runSimulation({ ...params, policy: 'none' });
  const simBaseline = runSimulation({ ...params, displacementRate: 0, policy: 'none' });

  const chartData = simWithPolicy.map((d, i) => ({
    ...d,
    unemploymentNoPolicy: simNoPolicy[i].unemploymentRate,
    gdpNoPolicy: simNoPolicy[i].gdp,
    consumptionNoPolicy: simNoPolicy[i].householdConsumption,
    fiscalNoPolicy: simNoPolicy[i].fiscalBalance,
  }));

  const final = simWithPolicy[simWithPolicy.length - 1];
  const finalBase = simBaseline[simBaseline.length - 1];

  const charts = {
    unemployment: {
      label: "Unemployment Rate",
      lines: [
        { key: "unemploymentRate", name: "With Policy", color: C.green },
        { key: "unemploymentNoPolicy", name: "No Policy", color: C.red },
      ],
      unit: "%", yDomain: [0, 30],
      desc: "ILO unemployment rate. Baseline is 5.1%. Cross-border workers cushion Switzerland's Okun coefficient to just −0.22."
    },
    gdp: {
      label: "GDP (CHF bn)",
      lines: [
        { key: "gdp", name: "With Policy", color: C.green },
        { key: "gdpNoPolicy", name: "No Policy", color: C.red },
      ],
      unit: " CHF bn", yDomain: ['auto', 'auto'],
      desc: "Nominal GDP. Consumption spiral feeds through Keynesian multiplier (0.40). CHF safe-haven appreciation adds export drag during global shocks."
    },
    consumption: {
      label: "Household Consumption",
      lines: [
        { key: "householdConsumption", name: "With Policy", color: C.blue },
        { key: "consumptionNoPolicy", name: "No Policy", color: C.red },
      ],
      unit: " CHF bn", yDomain: ['auto', 'auto'],
      desc: "Household consumption (52% of GDP). ALV replaces 75% of lost wages. UBI/Kurzarbeit provide further protection."
    },
    fiscal: {
      label: "Fiscal Balance (CHF bn)",
      lines: [
        { key: "fiscalBalance", name: "With Policy", color: C.accent },
        { key: "fiscalNoPolicy", name: "No Policy", color: C.muted },
      ],
      unit: " CHF bn", yDomain: ['auto', 'auto'],
      desc: "Federal + cantonal fiscal balance. Tax revenues shrink as GDP falls; social spending rises with unemployment."
    },
    debt: {
      label: "Public Debt / GDP",
      lines: [
        { key: "debtGDP", name: "With Policy", color: C.accent },
      ],
      unit: "%", yDomain: [20, 80],
      desc: "General govt debt as % of GDP. Starting from 40.5% — well below OECD average."
    },
  };

  const activeChartDef = charts[activeChart];

  const displacedWorkers = Math.round(params.displacementRate * SWISS.workforce);
  const policyLabel = {
    none: "No Policy Response",
    alv: "ALV (Existing Insurance Only)",
    kurzarbeit: "Kurzarbeit (Short-Time Work)",
    ubi: `UBI (CHF ${params.ubiAmount}/month)`,
    almp: "Active Labour Market Policies",
    reduced_hours: "Reduced Working Hours",
    combined: "Combined Policy Package",
  }[params.policy];

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: C.text, padding: "clamp(12px, 3vw, 24px)",
    }}>
      <style>{`
        .main-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: 3, textTransform: "uppercase" }}>
            ◆ Swiss Digital Twin
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>/ AI Unemployment Macroeconomic Simulator</div>
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(16px, 4vw, 22px)", fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
          AI Displacement Demand Spiral
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.textDim, maxWidth: 600 }}>
          Calibrated to Swiss macro parameters (SECO/BFS/SNB 2024–25). Models consumption collapse → multiplier → fiscal feedback loop.
        </p>
      </div>

      <div className="main-grid">

        {/* ── Left panel: controls ── */}
        <div>
          {/* Scenario parameters */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              DISPLACEMENT SCENARIO
            </div>

            <Slider
              label="AI Displacement Rate"
              value={params.displacementRate}
              min={0.02} max={0.45} step={0.01}
              onChange={set("displacementRate")}
              format={v => `${Math.round(v * 100)}% of workforce`}
              sublabel={`≈ ${displacedWorkers.toLocaleString()}k workers displaced`}
            />
            <Slider
              label="Displacement Speed"
              value={params.rampYears}
              min={2} max={15} step={1}
              onChange={set("rampYears")}
              format={v => `over ${v} years`}
              sublabel="Slower = more time to adapt"
            />
            <Slider
              label="Global AI Shock Intensity"
              value={params.globalShock}
              min={0} max={1} step={0.05}
              onChange={set("globalShock")}
              format={v => v === 0 ? "Switzerland only" : v < 0.4 ? `Mild (${Math.round(v*100)}%)` : v < 0.7 ? `Moderate (${Math.round(v*100)}%)` : `Severe (${Math.round(v*100)}%)`}
              sublabel="Global shock triggers CHF appreciation + export drag"
            />
          </div>

          {/* Policy selector */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              POLICY COUNTER-MEASURE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <PolicyBtn value="none" current={params.policy} onClick={set("policy")} label="No Policy" desc="Automatic stabilisers only" />
              <PolicyBtn value="alv" current={params.policy} onClick={set("policy")} label="ALV Only" desc="Existing unemployment insurance" />
              <PolicyBtn value="kurzarbeit" current={params.policy} onClick={set("policy")} label="Kurzarbeit" desc="Short-time work scheme" />
              <PolicyBtn value="ubi" current={params.policy} onClick={set("policy")} label="UBI" desc="Universal basic income" />
              <PolicyBtn value="almp" current={params.policy} onClick={set("policy")} label="ALMP" desc="Retraining programmes" />
              <PolicyBtn value="reduced_hours" current={params.policy} onClick={set("policy")} label="Shorter Hours" desc="Work redistribution" />
              <PolicyBtn value="combined" current={params.policy} onClick={set("policy")} label="Combined" desc="All policies active" />
            </div>
          </div>

          {/* Policy-specific sliders */}
          {(params.policy === 'kurzarbeit' || params.policy === 'combined') && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                KURZARBEIT PARAMETERS
              </div>
              <Slider
                label="Coverage"
                value={params.kurzarbeitCoverage}
                min={0.1} max={1} step={0.05}
                onChange={set("kurzarbeitCoverage")}
                format={v => `${Math.round(v * 100)}% of displaced`}
              />
            </div>
          )}

          {(params.policy === 'ubi' || params.policy === 'combined') && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                UBI PARAMETERS
              </div>
              <Slider
                label="Monthly UBI Amount"
                value={params.ubiAmount}
                min={500} max={3500} step={100}
                onChange={set("ubiAmount")}
                format={v => `CHF ${v.toLocaleString()}/mo`}
              />
            </div>
          )}

          {(params.policy === 'almp' || params.policy === 'combined') && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                ALMP PARAMETERS
              </div>
              <Slider
                label="Annual ALMP Spending"
                value={params.almPSpendingBn}
                min={1} max={20} step={0.5}
                onChange={set("almPSpendingBn")}
                format={v => `CHF ${v} bn/yr`}
              />
            </div>
          )}

          {(params.policy === 'reduced_hours' || params.policy === 'combined') && (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                HOURS REDUCTION
              </div>
              <Slider
                label="Hours Reduction"
                value={params.reducedHoursPct}
                min={0.05} max={0.30} step={0.01}
                onChange={set("reducedHoursPct")}
                format={v => `${Math.round(v * 100)}%`}
              />
            </div>
          )}
        </div>

        {/* ── Right panel: charts & KPIs ── */}
        <div>
          {/* KPI bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <KPI
              label="Unemployment (2039)"
              value={final.unemploymentRate.toFixed(1)}
              unit="%"
              delta={final.unemploymentRate - finalBase.unemploymentRate}
              good={false}
            />
            <KPI
              label="GDP (2039)"
              value={final.gdp.toFixed(0)}
              unit="CHF bn"
              delta={final.gdp - finalBase.gdp}
              good={true}
            />
            <KPI
              label="Debt/GDP (2039)"
              value={final.debtGDP.toFixed(1)}
              unit="%"
              delta={final.debtGDP - finalBase.debtGDP}
              good={false}
            />
            <KPI
              label="Cumulative Cost"
              value={final.cumulativeCost.toFixed(0)}
              unit="CHF bn"
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
                  />
                ))}
                {activeChart === "fiscal" && (
                  <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Policy info */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              ACTIVE POLICY
            </div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {policyLabel}
            </div>
            <div style={{ color: C.textDim, fontSize: 11 }}>
              Annual policy cost: <span style={{ color: C.accent }}>CHF {final.policySpending.toFixed(1)} bn</span>
              {" · "}
              ALV spending: <span style={{ color: C.accent }}>CHF {final.alvSpending.toFixed(1)} bn</span>
              {" · "}
              CHF appreciation: <span style={{ color: C.accent }}>{final.chfAppreciation.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, textAlign: "center" }}>
        <div style={{ color: C.textDim, fontSize: 10 }}>
          LabourShift — Swiss AI Displacement Macroeconomic Simulator · Calibrated to SECO/BFS/SNB 2024–25 data
        </div>
      </div>
    </div>
  );
}
