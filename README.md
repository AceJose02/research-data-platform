Research Data Visualization Platform

A full-stack analytics dashboard that allows users to upload datasets, generate interactive charts, analyze statistical summaries, and export professional PDF reports.

Built using React, Flask, Pandas, and Recharts.

 Features
Upload CSV, XLSX, and XLS datasets
Interactive Bar Charts and Pie Charts
Statistical summaries:
Mean
Median
Highest value
Lowest value
Count
Dynamic chart sorting
Dark Mode support
Download charts and statistics as PDF reports
Scrollable large dataset previews
Responsive modern dashboard UI
Supports larger datasets with filtering controls
🛠️ Tech Stack
Frontend
React
Vite
Axios
Recharts
jsPDF
html2canvas
Backend
Flask
Pandas
Flask-CORS
OpenPyXL
xlrd
 Project Structure
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
⚡ Installation
1. Clone Repository
git clone https://github.com/YOUR_USERNAME/research-data-visualization-platform.git
cd research-data-visualization-platform
🔧 Backend Setup
cd backend

python3 -m venv venv

source venv/bin/activate

pip install -r requirements.txt

python app.py

Backend runs on:

http://127.0.0.1:5000
 Frontend Setup

Open another terminal:

cd frontend

npm install

npm run dev

Frontend runs on:

http://localhost:5173
 Supported File Types
.csv
.xlsx
.xls

Google Sheets files can be used by exporting them as CSV or Excel files.
PDF Reports

Users can export:
    Statistical summaries
    Charts
    Filtered chart data as downloadable PDF reports.

Dark Mode
    The dashboard includes a built-in dark mode toggle for improved usability and accessibility.

Future Improvements
    AI-generated insights
    Advanced filtering/search
    Database integration
    User authentication
    Multiple dashboard views
    Real-time collaboration
    Direct Google Sheets API integration

Author
Jose D. Corea

Built as a full-stack data analytics and visualization project for software engineering portfolio development.