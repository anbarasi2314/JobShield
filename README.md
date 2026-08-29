# JobShield — AI-Powered Job & Internship Scam Detector

JobShield helps students, fresh graduates, and first-time job seekers check whether a job or internship offer shows common scam indicators — before they apply, pay anything, or share personal information.

This repo is the **Phase 1 deliverable**: a complete, functional, deployable frontend, including a transparent client-side risk-scoring engine so the whole product works end-to-end without a live backend yet.

**Live demo flow:** paste text / a URL / a screenshot → animated analysis → explained risk score, factor breakdown, extracted job info, and recommendations → saved to a local history log.

---

## 1. Project structure

```
jobshield/
├── index.html            Landing page
├── analyze.html           Analyzer: input tabs → processing → results
├── history.html            My Analysis History
├── safety-tips.html         Job Scam Safety Guide (educational)
├── about.html              About / problem / solution / disclaimer
├── styles.css              Full design system (tokens + components)
├── js/
│   ├── ui.js                 Shared nav, toast, inline icon set
│   ├── engine.js              Risk-scoring engine + localStorage history store
│   └── analyze.js             Analyzer page controller (tabs, validation, flow, rendering)
└── README.md
```

No build step, no framework, no dependencies beyond a Google Fonts import — open `index.html` directly, or deploy the folder as-is to any static host.

## 2. User flow

```
HOME → ANALYZE JOB → choose input (TEXT / URL / IMAGE) → submit
     → validation → processing animation → RISK SCORE
     → RISK BREAKDOWN → WHY THIS SCORE → RECOMMENDATIONS
     → saved to HISTORY → download / share report
```

All three input methods feed the same `JobShieldEngine.scoreText()` pipeline — URL and image inputs are normalized into text signal before scoring, so downstream rendering code (score, badges, factor list, recommendations) is identical regardless of input method.

## 3. Design system (in `styles.css`)

- **Palette:** deep navy/slate "situation room" background (`--bg`, `--surface`) with a signal-teal accent (`--accent: #33D6C0`), plus a dedicated 4-color semantic risk scale (low → high) that is never used as the *only* signal — every risk state also carries a text label and icon for accessibility.
- **Type:** Space Grotesk (display) + Inter (body) + JetBrains Mono (scores, badges, data — reinforces the "dashboard readout" feel).
- **Components:** navbar, mobile menu, buttons, cards, method tabs, text/URL/file inputs, dropzone + preview, risk badges, semicircular risk meter, factor rows with severity bars, step cards, history table, checklist, toast, footer — all built from the same token set in one stylesheet.
- Responsive down to mobile (hamburger nav, stacked tabs, single-column cards, touch-sized buttons); respects `prefers-reduced-motion`; visible focus states throughout.

## 4. Current analysis engine (`js/engine.js`)

For this phase, scoring is a **transparent, weighted keyword/heuristic model** that runs entirely in the browser — no API key, no backend, no network call required to demo the product. It checks submitted text for patterns across 8 categories (payment requests, salary claims, contact info, urgency, sensitive-data requests, unofficial links, missing company info, unusual hiring process), each contributing a weighted score, and returns:

- a 0–100 score and risk level (Low / Medium / Elevated / High),
- the specific factors that fired, each with a plain-language explanation,
- best-effort extracted job info (title, company, location, salary, experience) — fields the engine can't confidently extract are shown as "Not available," never guessed,
- risk-appropriate recommendations.

`JobShieldEngine.scoreText()` is the single seam to replace with a real backend/AI call in Phase 5 — every screen that consumes its output stays unchanged.

## 5. Development phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Frontend UI (this repo) | ✅ Done |
| 2 | Text analysis | ✅ Done (heuristic engine) |
| 3 | URL analysis | ✅ Done (heuristic engine) |
| 4 | Image upload + real OCR | 🔜 Frontend ready; OCR extraction pending |
| 5 | AI-assisted risk analysis (backend) | 🔜 Swap `scoreText()` for an API call |
| 6 | Cloud database | 🔜 Persist history server-side |
| 7 | Analysis history (server-backed) | 🔜 Currently local-only (`localStorage`) |
| 8 | Report generation (PDF) | 🔜 Currently plain-text download |
| 9 | Authentication (if needed) | 🔜 |
| 10 | Deployment | 🔜 Static frontend is deploy-ready today |

## 6. Proposed cloud architecture (Phases 4–10)

Kept intentionally simple and free-tier friendly for a student project — no need for anything enterprise-grade.

```
                         ┌───────────────────────┐
   Frontend (static) ───▶│   Backend / API layer  │───▶  AI analysis (LLM API)
   Vercel / Netlify /    │   (serverless funcs)   │      e.g. Anthropic/OpenAI API
   GitHub Pages          │   Vercel/Netlify funcs  │      called server-side only
                         │   or a small FastAPI/    │
                         │   Express app on Render  │
                         └───────────┬────────────┘
                                     ▼
                         ┌───────────────────────┐
                         │      Database          │
                         │  Firebase Firestore /  │
                         │  Supabase (Postgres)   │
                         └───────────────────────┘

Text input:   Frontend → Backend → AI Analysis → Database → Results
URL input:    Frontend → Backend → URL/content extraction → AI Analysis → Database → Results
Image input:  Frontend → Cloud Storage (Supabase/Firebase Storage)
                        → OCR (Tesseract.js client-side, or Google Cloud Vision API)
                        → AI Analysis → Database → Results
```

**Suggested stack** (free-tier friendly, easy to configure/deploy):
- **Hosting:** Vercel, Netlify, or GitHub Pages
- **Backend:** Vercel/Netlify serverless functions, or a small FastAPI/Express app on Render
- **Database:** Supabase (Postgres) or Firebase Firestore
- **File storage:** Supabase Storage or Firebase Storage
- **OCR:** Tesseract.js (client-side, free) as a starting point; Google Cloud Vision API for higher accuracy later
- **AI analysis:** a hosted LLM API called **only from the backend**, never with a key exposed in frontend JS

## 7. Suggested database structure

```
users(optional)        id, email, created_at
analyses                id, user_id (nullable), input_type [text|url|image],
                        raw_input_ref, job_title, company, location, salary,
                        experience, score, risk_level, factors (jsonb),
                        recommendations (jsonb), created_at
```

## 8. Security notes

- No AI API keys are ever placed in frontend JavaScript — API calls to a real AI backend must go through a server/serverless function.
- All inputs (text length, URL format, file type/size) are validated client-side today and must be **re-validated server-side** once a backend exists — never trust client validation alone.
- History currently lives only in the visitor's own browser (`localStorage`); nothing is transmitted anywhere in this phase.
- Every result screen carries an explicit disclaimer: JobShield produces an automated, indicator-based risk assessment, not a definitive determination.

## 9. Deploying this build

Because this is a static site with no build step:

1. **Netlify / Vercel:** drag-and-drop the folder, or connect the GitHub repo — no build command needed.
2. **GitHub Pages:** push to a repo, enable Pages on the `main` branch root.
3. **Any static host:** copy the folder as-is.

---

*Risk assessments produced by JobShield are automated and indicator-based. They are not a definitive determination that any job or internship offer is fraudulent. Always verify employers independently.*
