# Changes in 2.0

A rewrite of both the backend and the frontend. Every issue below was found in
the 1.0 code. Each backend fix has a regression test in `backend/tests/`.

## Updating your repository

1.0 committed the Python virtual environment and macOS `.DS_Store` files to git.
After copying in the new files, stop tracking them (this keeps them on disk):

```bash
git rm -r --cached backend/venv .DS_Store backend/.DS_Store backend/venv/.DS_Store
git rm -r --cached backend/uploads
git add .gitignore
git commit -m "Version 2.0: rewrite backend and frontend"
```

Then recreate the environment with `pip install -r requirements.txt`, because the
dependency list changed. The sample files moved from `backend/uploads/` to `backend/samples/`.

## Requirements

Node.js **20.19+ or 22.12+** is required (Vite 8). On Node 22.0–22.11, npm used to
install without Vite's native bundler, and `npm run dev` then failed with "Cannot find
native binding". `frontend/.npmrc` now sets `engine-strict=true`, so `npm install`
stops immediately with a clear version error instead.

## Samples and welcome screen

- **Richer sample datasets** that show what the platform can do:
  - *Wellbeing survey* (CSV): 400 participants and 18 variables. Built-in patterns to find:
    - wellbeing rises with exercise and sleep, and falls with stress
    - wellbeing dips in midlife
    - people who meditate report less stress
    - income rises with education

    Income is stored as text like `$52,000` to show the parser at work.
  - *Employee directory* (Excel, three sheets):
    - 160 employees, with salary bands by department, level and office
    - Boston ZIP codes with leading zeros
    - engagement that varies by manager
    - a *Department Summary* sheet built from live formulas
    - 1,185 quarterly *Performance Reviews* over 30 months

  All sample data is synthetic.
- **Animated chart backdrop** on the welcome screen's empty right side:
  - a histogram whose bars rise and fall
  - a line chart that draws itself
  - growing comparison bars
  - a pulsing scatter plot

  Each panel floats and zooms gently. It follows the light or dark theme, is hidden on narrow screens, and stands still for anyone with reduced motion turned on.

## Backend fixes

### Security

- **Path traversal on upload.** `file.save(os.path.join("uploads", file.filename))`
  used the client's filename, so a name like `../../app.py` could overwrite files.
  Each upload is now saved as `data/<random id>/source.<ext>`.
- **Files were saved before they were validated.** An unsupported file was written
  to disk and only then rejected. The extension is now checked first, and a
  file that fails to parse is deleted.
- **No upload size limit.** It's now 50 MB by default (`RDP_MAX_UPLOAD_MB`), with a clear message when exceeded.
- **`debug=True` was hard-coded.** The Werkzeug debugger allows running arbitrary
  code if the server is reachable. Debug mode is now off unless `FLASK_DEBUG=1`.
- **CORS allowed every origin.** It's now limited to configured origins, and not needed at all in development (Vite proxies `/api`).
- **Raw exception text was returned to users.** Errors are now plain-language
  messages, unexpected errors are logged on the server, and every error has the same JSON shape.

### Correctness

- **One dataset shared by everyone.** A global `latest_data` meant any upload
  replaced the data for every open tab and user. Each upload now has its own ID.
  Datasets are cached in memory, reloaded from disk after a restart, and deleted after 24 hours unused.
- **Invalid JSON.** NaN and Infinity were written as bare `NaN` / `Infinity`
  tokens, which browsers refuse to parse. All values are now converted to strict JSON.
- **Column names in URL paths broke.** `/stats/<column>` failed for names
  containing `/`, `#`, `?` or `%`, and for non-text Excel headers. Columns are now passed as query parameters.
- **"Numeric" if a single value parsed.** A text column with one number in it got
  numeric statistics. A column is now numeric only if at least 95% of its values parse.
- **Charts of continuous numbers were meaningless.** `value_counts()` produced
  one bar per unique income (40 bars of height 1). Continuous columns now get a
  histogram with round bin edges, and small whole-number scales get one bar per value.
- **Inconsistent cleaning.** `$` and `,` were stripped for statistics but not for charts. One shared parser now handles:
  - currency symbols and thousands separators
  - negatives in parentheses
  - percentages
  - European decimal commas (`3,5`)
- **ZIP codes lost their leading zeros.** `02139` became `2139`. Code-like columns now stay as text, in CSV and Excel files. (`pandas.read_excel` converts text such as "02139" to numbers on its own, so Excel files are read untouched and types restored per column.)
- **Only UTF-8, comma-separated CSVs worked.** Windows-1252 and Latin-1
  encodings and semicolon, tab or pipe delimiters are now detected.
- **Only the first Excel sheet was readable.** All sheets are listed and can be switched.
- **Messy files:** blank rows, whitespace-only cells, duplicate headers and empty `Unnamed: N` columns are cleaned up.
- **`/summary` sent the whole dataset** to the browser, and computed a `describe()` that was never used. Rows are now served a page at a time.

## Frontend fixes

- **Missing `vite.config.js`.** The README listed it but it didn't exist. Added, with the React plugin and a dev proxy for `/api`.
- **Unhandled errors.** No request had error handling, so a failed upload or a stopped backend left the page silently stuck.
  Every request now shows a clear message, with a retry button where it helps.
- **Stale results after a new upload.** The previous file's chart and statistics stayed on screen. State now resets per dataset and per sheet.
- **Out-of-order responses.** Switching columns quickly could show an older
  column's chart under a newer name. Superseded requests are now cancelled.
- **Uncontrolled selects** kept showing old choices after state changed. All controls are now controlled.
- **Every row was rendered into the page,** which froze the browser on large files. The table is now paged on the server.
- **Dark mode never darkened the page background.** The `.page.dark body` selector can't match, because `body` contains `.page`.
  Themes now use CSS variables on the root element, apply before first paint, and remember your choice.
- **Chart text was unreadable in dark mode.** Axes, tooltips and reference lines now follow the theme.
- **The PDF clipped and squashed content.** html2canvas captured only the visible part of horizontally scrolled charts.
  It also shrank tall reports to fit one page. Reports are now built directly as text, vector charts and multi-page tables, with page numbers.
- **The top-N control changed the on-screen chart**, although it was labelled as a PDF setting.
  The chart now has its own "Show" control, and the export dialog has its own frequency-table setting.
- **Rainbow bar colours** carried no meaning. Bars are now a single colour, with the hovered bar highlighted.
- **Unreadable pie charts** with dozens of slices. Pies now show at most 8 slices, with "Other" for the rest.
- **Hard-coded `http://127.0.0.1:5000`** API address. Requests now go to the same origin, configurable with `VITE_API_URL`.
- **Incomplete `index.html`.** There was no doctype, `<head>`, charset, viewport or title.
- **`"latest"` for every dependency** made installs unreproducible. Versions are now pinned, with `build` and `preview` scripts added.
- **Accessibility:**
  - labels weren't connected to their inputs, and there were no focus styles
  - the emoji-only headings came from CSS `content`
  - now: labelled controls, visible keyboard focus, arrow-key navigation in the codebook, `aria-sort` on table headers, a skip link, and reduced-motion support

## New features

- Redesigned interface built around a researcher's notebook:
  - a codebook of variables
  - statistics written in APA style
  - a highlighter for the selected variable
  - red for missing values
- Sample datasets on the welcome screen.
- Drag-and-drop upload with progress.
- Descriptive statistics: SD, standard error, quartiles, IQR, skewness, sum, mode.
- Group comparison: mean, median, total, minimum, maximum or count of a variable for each group, with a line for the overall value.
- Search, sort and paging in the data table, keeping the original row numbers.
- An export dialog to choose which sections go in the PDF.
- The open dataset and variable are kept in the URL, so refreshing the page keeps your place.
- Flask serves the built frontend, so production runs on a single port.
- 41 backend tests, passing on pandas 2.3 and 3.0 with Python 3.9+.
