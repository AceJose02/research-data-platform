# Research Data Platform

Upload a CSV or Excel dataset and explore it the way a researcher would: every
variable gets a codebook entry, summary statistics written in APA style
(*M*, *SD*, *Mdn*), and a distribution chart. Compare groups, browse and search
the rows, and export a PDF report with vector charts and tables.

Built with **React + Vite + Recharts** on the frontend and **Flask + pandas** on the backend.

## Features

- **Upload CSV, TSV, or Excel** (`.xlsx`, `.xlsm`, `.xls`) by drag and drop, with upload progress.
  Text encoding and delimiters (comma, semicolon, tab) are detected automatically.
  Excel workbooks with several sheets can be switched from the top bar.
- **Sample datasets** to try the app immediately.
- **Codebook** of every variable with its type and missing-value count. Types are inferred from the data:
  - numbers stored as text, like `$52,000`, `(1,200)`, `3,5` or `45%`, are read as numeric
  - codes with leading zeros (ZIP codes) stay as text
  - small whole-number scales (1–7 ratings, days per week) are recognised as discrete
  - dates, yes/no columns and identifier columns are detected
- **Distributions**
  - histograms with round bin edges and mean and median lines
  - one bar per value for discrete scales
  - top-N category bars or a pie chart, with an "Other" bucket
  - counts over time for dates
- **Descriptive statistics:** mean, SD, SE, quartiles, IQR, skewness, sum, mode and more.
- **Compare groups:** "show the *mean* of *income* for each *education level*", including median, total, minimum, maximum and counts.
- **Data table**, paged, sorted and searched on the server so large files stay fast. It keeps the original row numbers.
- **PDF report** containing a codebook, a variable report and a group comparison, drawn as sharp vector graphics across as many pages as needed.
- **Paper (light) and blueprint (dark) themes**, a responsive layout, keyboard support, and reduced-motion support.
- **Your place is kept in the URL**, so refreshing the page reopens the same dataset and variable.

## Quick start

You need **Python 3.9+** and **Node.js 20.19+ or 22.12+** (check with `node -v`). Node 22.0–22.11 is not supported by Vite 8.

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The API runs at `http://127.0.0.1:5000` (health check: `/api/health`).

### 2. Frontend (development)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server forwards `/api` to the backend, so no CORS setup is needed.

### Production: one port

Build the frontend once and Flask serves it alongside the API:

```bash
cd frontend && npm run build        # creates frontend/dist
cd ../backend && python app.py      # now serves the app at http://127.0.0.1:5000
```

For a real deployment, use a WSGI server with a **single worker**, because parsed datasets are cached in process memory:

```bash
pip install gunicorn
gunicorn "app:app" --bind 0.0.0.0:5000 --workers 1 --threads 8
```

## Configuration

All settings are optional environment variables. See `backend/.env.example` and `frontend/.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `RDP_HOST` / `RDP_PORT` | `127.0.0.1` / `5000` | Where the API listens |
| `FLASK_DEBUG` | `0` | Never enable on a reachable server; the debugger allows code execution |
| `RDP_MAX_UPLOAD_MB` | `50` | Upload size limit |
| `RDP_DATA_DIR` | `backend/data` | Where uploaded datasets are stored |
| `RDP_DATASET_TTL_HOURS` | `24` | Datasets unused this long are deleted |
| `RDP_CACHE_SIZE` | `8` | Parsed datasets kept in memory |
| `RDP_CORS_ORIGINS` | `http://localhost:5173,…` | Origins allowed to call the API directly |
| `RDP_STATIC_DIR` | `frontend/dist` | Built frontend to serve, if present |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:5000` | Backend address for `npm run dev` |
| `VITE_API_URL` | *(same origin)* | Only if the frontend is hosted separately from the API |

## API

Every endpoint lives under `/api` and returns JSON. Errors have the shape
`{"error": {"code": "...", "message": "..."}}`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Status, upload limit, accepted extensions |
| `GET` | `/api/samples` | Sample datasets |
| `POST` | `/api/samples/<id>` | Open a sample as a new dataset |
| `POST` | `/api/datasets` | Upload (`multipart/form-data`, field `file`, optional `sheet`) |
| `GET` | `/api/datasets/<id>` | Dataset metadata and codebook |
| `DELETE` | `/api/datasets/<id>` | Delete a dataset |
| `POST` | `/api/datasets/<id>/sheet` | Switch Excel sheet: `{"sheet": "Name"}` |
| `GET` | `/api/datasets/<id>/rows` | `page`, `page_size`, `sort`, `order`, `q` |
| `GET` | `/api/datasets/<id>/analysis` | `column`, optional `top`, `bins` |
| `GET` | `/api/datasets/<id>/aggregate` | `group_by`, `metric`, `agg` (mean, median, sum, min, max, count), `sort` |

Column names are passed as query parameters, so names containing `/`, `#`, `?` or `%` work.

## Project structure

```
research-data-platform/
├── backend/
│   ├── app.py               # entry point
│   ├── rdp/
│   │   ├── __init__.py      # app factory, error handlers, frontend serving
│   │   ├── api.py           # routes
│   │   ├── config.py        # settings from environment variables
│   │   ├── loader.py        # CSV/Excel reading and cleanup
│   │   ├── profiling.py     # column type inference
│   │   ├── analysis.py      # statistics, distributions, group comparison, row queries
│   │   ├── store.py         # per-dataset storage, cache, expiry
│   │   ├── serialize.py     # strict JSON conversion (no NaN/Infinity)
│   │   └── errors.py
│   ├── samples/             # sample datasets
│   ├── tests/               # pytest suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── styles.css
│   │   ├── components/      # Codebook, VariablePanel, DistributionChart, GroupComparison, DataTable, …
│   │   ├── hooks/
│   │   └── lib/             # formatting, column rules, chart colours, PDF report
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── CHANGES.md
└── README.md
```

## Troubleshooting

**`npm install` fails with `EBADENGINE` / "Not compatible with your version of node"**, or
**`npm run dev` fails with "Cannot find native binding"**: your Node.js is too old for Vite 8,
so npm skipped Vite's native bundler. Upgrade Node, then reinstall:

```bash
node -v                       # needs v20.19+ or v22.12+
brew upgrade node             # if Node came from Homebrew
# or: nvm install 22 && nvm use 22
# or: download the LTS installer from https://nodejs.org

cd frontend
rm -rf node_modules
npm install
npm run dev
```

**The page says it can't reach the server**: start the backend (`python app.py` in `backend/`).
The frontend dev server forwards `/api` to `http://127.0.0.1:5000`.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

## Notes

- There is no user authentication. Each dataset is reachable by anyone who has its link, which contains a random 128-bit ID.
  Run the app on a trusted network, or put it behind your organisation's login, before using it with sensitive data.
- PDF reports use the standard PDF fonts, which cover Western European characters.
  Characters outside that set (for example CJK column names) appear as `?` in the PDF but display normally in the app.
- Google Sheets: export with **File → Download → CSV or Excel** and upload the file.

## Author

**Jose D. Corea**
