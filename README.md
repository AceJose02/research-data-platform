# 📊 Research Data Visualization Platform

A full-stack analytics dashboard for uploading datasets, generating interactive charts, analyzing statistical summaries, and exporting professional PDF reports.

Built with **React**, **Flask**, **Pandas**, and **Recharts**.

---

## Features

- **Dataset uploads** — supports CSV, XLSX, and XLS files
- **Interactive charts** — Bar Charts and Pie Charts with dynamic sorting
- **Statistical summaries** — Mean, Median, Highest value, Lowest value, and Count
- **PDF export** — download charts and statistics as formatted PDF reports
- **Dark mode** — built-in toggle for improved usability and accessibility
- **Large dataset support** — scrollable previews with filtering controls
- **Responsive UI** — modern dashboard layout that works across screen sizes

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React, Vite, Axios, Recharts, jsPDF, html2canvas |
| **Backend** | Flask, Pandas, Flask-CORS, OpenPyXL, xlrd |

---

## Project Structure

```
research-data-platform/
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── style.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── uploads/
│   ├── app.py
│   ├── requirements.txt
│   └── venv/
│
└── README.md
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/research-data-visualization-platform.git
cd research-data-visualization-platform
```

### 2. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Backend runs at: `http://127.0.0.1:5000`

### 3. Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

---

## Supported File Types

| Format | Notes |
|--------|-------|
| `.csv` | Standard comma-separated values |
| `.xlsx` | Excel (2007+) |
| `.xls` | Legacy Excel format |

> **Google Sheets** users can export their spreadsheet as CSV or Excel via **File → Download**.

---

## PDF Reports

Users can export the following as downloadable PDF reports:

- Statistical summaries
- Charts
- Filtered chart data

---

## Dark Mode

The dashboard includes a built-in dark mode toggle for improved usability and reduced eye strain.

---

## Future Improvements

- AI-generated data insights
- Advanced filtering and search
- Database integration
- User authentication
- Multiple dashboard views
- Real-time collaboration
- Direct Google Sheets API integration

---

## Author

**Jose D. Corea**

Built as a full-stack data analytics and visualization project for software engineering portfolio development.
