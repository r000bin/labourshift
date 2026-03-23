# labourshift — Research Resources & Reading List

Key sources used in the initial scoping session, annotated for quick reference.

---

## Swiss AI Exposure & Labour Market Impact

**Siegenthaler & Kläui (KOF/ETH, December 2025)**
"I expect AI to make us all richer"
https://kof.ethz.ch/en/publications/kof-insights/articles/2025/12/i-expect-ai-to-make-us-all-richer.html
→ *The most important Swiss-specific source. First empirical evidence that AI has already measurably affected the Swiss labour market post-ChatGPT. Finds ~1/5 of unemployment increase in exposed professions attributable to AI. Key finding: younger workers more affected than experienced ones — an inversion of previous tech transitions. Provides occupational AI-exposure scores for Switzerland.*

**KOF Swiss Economic Institute (2022)**
"How computerisation is transforming the Swiss labour market"
https://kof.ethz.ch/en/news-and-events/kof-bulletin/kof-bulletin/2022/09/How-computerisation-is-transforming-the-Swiss-labour-market.html
→ *Historical context on routine vs non-routine task shifts in Switzerland since the 1990s. Shows the pre-AI structural shift was already well underway. Useful baseline for modelling.*

**OECD Job Creation & Local Development — Switzerland Country Note (2024)**
https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/11/job-creation-and-local-economic-development-2024-country-notes_65d489c5/switzerland_3f0684c0/d5adc47c-en.pdf
→ *Source of the 32.2% GenAI exposure figure (6.2pp above OECD average of 26%) and the contrasting 3.5% traditional automation risk. Zurich-specific: 39.4% GenAI exposure. Essential calibration data.*

**Arntz, Gregory & Zierahn — OECD (2016)**
"The Risk of Automation for Jobs in OECD Countries: A Comparative Analysis"
https://wecglobal.org/uploads/2019/07/2016_OECD_Risk-Automation-Jobs.pdf
→ *Methodological foundation for task-based automation risk. More conservative than Frey & Osborne (2013). Switzerland estimates: ~12% of jobs at high risk under task-based approach vs 47% under occupation-based. Explains the 3.5% figure above.*

---

## Theoretical Framework

**Acemoglu & Restrepo (2018, 2022)**
"The Wrong Kind of AI?" / "Tasks, Automation, and the Rise in US Wage Inequality"
→ *The core theoretical backbone for labourshift. Task-based framework distinguishing displacement tasks (AI replaces workers) from reinstatement tasks (AI creates new roles). Critical insight: automation only raises unemployment and inequality when displacement outpaces reinstatement. NOT yet calibrated to Switzerland — this is the central modelling gap the project aims to fill.*

**Jones & Tonetti**
Automation and growth model
→ *Complementary to Acemoglu-Restrepo. Models long-run growth effects of automation. Less immediately actionable but useful for the 15-year simulation horizon.*

---

## Swiss Macro Parameters & Fiscal Data

**Swiss Federal Finance Administration — Public Finances 2023–2024**
https://www.efv.admin.ch/dam/en/sd-web/eN3o9LnwCuBV/2025-hauptpublikation-e.pdf
→ *Primary source for debt/GDP (40.5%), govt expenditure/GDP (31.3%), debt brake mechanics, federal revenue breakdown. Essential calibration document.*

**Federal Office of Social Insurance — Pocket Statistics 2024**
https://www.bsv.admin.ch/dam/en/sd-web/zWdB5QA3f23L/Swiss%20social%20insurance%20system%20(Pocket%20statistics%202024).pdf
→ *Comprehensive breakdown of all Swiss social insurance schemes. Source for: ALV fund balance (CHF 6.8 bn), total social expenditure (CHF 179.5 bn), Sozialhilfe cost (CHF 2.5 bn), EL supplementary benefits (CHF 5.7 bn). One PDF, very dense with numbers.*

**SECO — arbeit.swiss (ALV parameters)**
https://www.arbeit.swiss/secoalv/en/home/menue/stellensuchende/arbeitslos-was-tun-/finanzielles.html
→ *Official source for ALV replacement rates (70/80%), duration (400/520 daily allowances), contribution rates (2.2% total). Use for policy modelling.*

**SNB Data Portal**
https://data.snb.ch
→ *Monetary policy rates, FX reserves, balance sheet data (~99% of GDP), current account. Programmatic API available.*

**IMF Article IV Consultation — Switzerland 2024**
https://www.elibrary.imf.org/view/journals/002/2024/179/article-A001-en.xml
→ *Independent macro assessment. Good cross-check on SECO/BFS figures. Contains fiscal multiplier estimates and structural balance assessments.*

---

## Labour Market Data & Statistics

**Swiss Federal Statistical Office (BFS/OFS)**
https://www.bfs.admin.ch
→ *Primary source for everything labour-market. Key datasets: SAKE (Swiss Labour Force Survey, quarterly, ~105k interviews/year), wage structure survey (median CHF 7,024), employment by sector, part-time rates (38.7%). R package `BFS` for programmatic access.*

**BFS — Part-Time Employment 2024**
https://www.bfs.admin.ch/news/en/2025-0478
→ *38.7% part-time rate, 58% of women part-time. Important for reduced working hours modelling — Switzerland already has unusual flexibility.*

**EURES — Labour Market Information Switzerland**
https://eures.europa.eu/living-and-working/labour-market-information/labour-market-information-switzerland_en
→ *EU perspective on Swiss labour market. Good for cross-border worker context and bilateral agreement implications.*

**Le News — Cross-Border Workers Record (Nov 2024)**
https://lenews.ch/2024/11/09/switzerlands-cross-border-workers-reach-record-level/
→ *403,000 Grenzgänger at record level. Geneva (114,700), Ticino (65,000), Basel (58,000). The 7.6% workforce buffer that explains Switzerland's unusually small Okun coefficient.*

---

## Okun's Law & Multipliers

**Ball, Leigh & Loungani — IMF (2012)**
"Okun's Law: Fit at 50?"
http://www.econ2.jhu.edu/People/Ball/okuns_law.pdf
→ *Cross-country Okun coefficients. Switzerland: −0.22 (3rd smallest in OECD). US: −0.45. Spain: −0.85. The Swiss figure reflects cross-border worker adjustment mechanism. Core parameter for the simulation engine.*

**OECD Economic Outlook 2019**
"How effective are automatic fiscal stabilisers?"
https://www.oecd.org/en/publications/2019/12/oecd-economic-outlook-volume-2019-issue-2_e1174019/full-report/component-9.html
→ *Switzerland offsets ~80% of market income shocks through automatic stabilisers — among highest in OECD despite small govt sector. Paradox explained by progressive tax design quality.*

---

## Policy Counter-Measures

**UBI — 2016 Swiss Referendum**
https://www.loc.gov/item/global-legal-monitor/2016-06-06/switzerland-voters-reject-unconditional-basic-income/
→ *Voters rejected CHF 2,500/month UBI 76.9% to 23.1%. Federal Council estimated gross cost CHF 208 bn/year, net CHF 25 bn after replacing existing transfers. Historical political baseline for UBI modelling.*

**UBI Labour Supply Effects — Cambridge (Jaimovich et al.)**
https://www.janeway.econ.cam.ac.uk/working-paper-pdfs/jiwp2205.pdf
→ *Key calibration paper. Finds UBI set at 10% of average income paired with existing UI could increase aggregate output 1.27% and reduce unemployment 0.5pp. Income elasticity of LFP: −0.1 to −0.3.*

**Swiss ALMP — Heterogeneous Effects (arXiv 2024)**
https://arxiv.org/html/2410.23322v1
→ *Causal ML analysis of Swiss active labour market policies. Critical finding: some programmes detrimental on average but beneficial for specific subgroups. Implies targeted rather than blanket ALMP is more efficient. 2-year lag before employment effects appear.*

**Kurzarbeit — COVID Case Study**
https://www.swissinfo.ch/eng/business/pandemic-costs-chf11-billion-in-temporary-unemployment-payments/46647102
→ *1.3 million workers on Kurzarbeit at peak (>20% of workforce). CHF 11 bn year-1 cost, ~CHF 26 bn total. Kept unemployment at ~4% vs 14.7% in US. The stress test proving the scheme works — but designed for temporary shocks, not permanent AI displacement.*

**Reduced Hours — Zurich 35h Trial**
https://www.swissinfo.ch/eng/business/city-of-zurich-to-trial-35-hour-workweek/48365696
→ *City of Zurich trialling 35-hour week for shift workers from 2023. First Swiss institutional experiment. Watch for results.*

**Robot Taxation — MIT Research**
https://news.mit.edu/2022/robot-tax-income-inequality-1221
→ *Costinot & Werning (2022): optimal robot tax should be "modest" to avoid excessive distortions. Swiss-specific constraint: FDI elasticity to tax rates −0.5 to −3.0 and intense cantonal tax competition make this the least viable Swiss policy option.*

---

## Existing Models (Potential Foundations)

**SNB DSGE-CH (Cuche-Curti, Dellas & Natal, 2009)**
https://www.snb.ch/en/publications/research/economic-studies/2009/01/economic_studies_2009_05
→ *The SNB's core macro model. Small open economy with real/nominal rigidities. Swiss-calibrated. Missing: task-level AI mechanism. Starting point for a DSGE extension.*

**SWISSMOD Microsimulation (Kirn, Oschwald & Anderl, 2025)**
https://www.researchgate.net/publication/392464250_SWISSMOD_-_A_New_Tax-Benefit_Model_of_Switzerland
→ *First comprehensive Swiss microsimulation on EUROMOD platform. Models all federal/cantonal/municipal taxes and all social insurance. Uses Swiss SILC data. Essential for distributional analysis layer (Milestone 3). No macro feedback loop — needs coupling.*

**Agent-Based Model of Swiss Labour Market (Baruffini et al.)**
https://www.researchgate.net/publication/260487773_An_Agent-Based_Simulation_of_the_Swiss_Labour_Market_An_Alternative_for_Policy_Evaluation
→ *Only identified Swiss ABM. Covers Ticino canton only (NetLogo). Models worker-firm matching, human capital investment, cross-border dynamics. Blueprint for Milestone 4 national ABM extension.*

**KOF Medium and Long-Term Scenarios**
https://kof.ethz.ch/en/the-institute/kof-divisions/research-division-kof-lab/medium-and-longterm-scenarios.html
→ *KOF's own scenario modelling infrastructure. Potential collaboration target — they have the Swiss data and occupational AI scores.*

---

## Education & Vocational Training

**OECD — Vocational Education & Training in Switzerland**
https://www.oecd.org/en/publications/vocational-education-and-training-systems-in-nine-countries_1a86eb6c-en/full-report/vocational-education-and-training-in-switzerland_051e4a43.html
→ *~2/3 of Swiss youth go through dual-track VET apprenticeships. World #1 ranked by WEF. Key resilience factor — the medium-skill layer is unusually well-equipped for reskilling. Relevant for ALMP effectiveness modelling.*

---

## CHF & Monetary Constraints

**CNBC — CHF Safe Haven (2025)**
https://www.cnbc.com/2025/06/04/swiss-franc-why-a-strong-currency-is-causing-problems-for-switzerland.html
→ *Good explainer on the safe-haven dynamics. SNB policy rate at 0.00% since June 2025, cut from 1.75% in 6 steps. Balance sheet ~99% of GDP. The perverse feedback: global AI shock → CHF appreciation → export compression compounds domestic demand shock.*

---

## Data Access (Programmatic)

| Dataset | URL | Notes |
|---|---|---|
| BFS R package | https://felixluginbuhl.com/BFS/ | 500+ datasets, SAKE microdata |
| SNB data portal | https://data.snb.ch | REST API, monetary/financial data |
| SECO labour stats | https://amstat.ch | Monthly unemployment, ALV, Kurzarbeit |
| KOF Economic Barometer | https://kof.ethz.ch/en/forecasts-and-indicators/indicators/kof-economic-barometer.html | Leading indicator |
| KOF Swiss Job Tracker | https://kof.ethz.ch/en/forecasts-and-indicators/indicators/swiss-job-tracker.html | Real-time vacancy data |
| OECD.Stat | https://stats.oecd.org | Cross-country comparison |
| Swiss input-output tables | BFS (px.haiku.ch) | 2008/2011/2014/2017, NOGA classification |

---

*labourshift — compiled March 2026*
