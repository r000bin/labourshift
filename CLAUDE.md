# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LabourShift is a Swiss AI displacement macroeconomic simulator — an interactive single-page app that models the impact of AI-driven job displacement on Switzerland's economy and evaluates policy counter-measures (Kurzarbeit, UBI, ALMP, reduced hours). Calibrated to SECO/BFS/SNB 2024–25 data.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — Production build (outputs to `dist/`)
- `npm run preview` — Preview production build locally

No test framework or linter is configured.

## Architecture

This is a minimal Vite + React app with no routing or state management library. The entire application lives in two files:

- **`src/App.jsx`** — Contains everything: Swiss macro parameters (`SWISS` object), the simulation engine (`runSimulation`), all UI components (Slider, KPI, PolicyBtn, CustomTooltip), and the main `SwissDigitalTwin` component. The simulation runs three scenarios on every render (with policy, no policy, baseline) and feeds results to Recharts.
- **`src/main.jsx`** — React entry point, renders `SwissDigitalTwin`.

Charts use **Recharts** (`recharts` package). Styling is entirely inline CSS with a dark theme color palette defined in the `C` object.

## Deployment

GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). Deploys on push to `main` or `claude/setup-github-page-xk59m`. The Vite `base` is set to `/labourshift/` for GitHub Pages path prefix.

## Key Domain Concepts

The simulation models a demand spiral: AI displacement → unemployment → lost income → consumption drop → GDP contraction → fiscal pressure. Swiss-specific features include the cross-border worker buffer (Grenzgänger), CHF safe-haven appreciation during global shocks, and the ALV unemployment insurance system. See `REFERENCES.md` for the academic sources behind the model parameters.
