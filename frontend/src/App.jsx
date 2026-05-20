import { useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const API_URL = "http://127.0.0.1:5000";

function App() {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [preview, setPreview] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [chartData, setChartData] = useState([]);
  const [message, setMessage] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [stats, setStats] = useState(null);
  const [pdfLimit, setPdfLimit] = useState("10");
  const [darkMode, setDarkMode] = useState(false);

  const COLORS = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#ca8a04",
    "#db2777",
    "#4f46e5",
    "#0f766e"
  ];

  const reportChartData =
    pdfLimit === "all" ? chartData : chartData.slice(0, parseInt(pdfLimit));

  const uploadFile = async () => {
    if (!file) {
      alert("Please choose a CSV, Excel, or Google Sheets exported file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await axios.post(`${API_URL}/upload`, formData);
    setColumns(res.data.columns);
    setMessage(`Uploaded ${res.data.rows} rows successfully.`);

    const summaryRes = await axios.get(`${API_URL}/summary`);
    setPreview(summaryRes.data.preview);
  };

  const loadChart = async (column) => {
    if (!column) return;

    setSelectedColumn(column);

    const chartRes = await axios.get(`${API_URL}/chart-data/${column}`);

    const formatted = chartRes.data.labels
      .map((label, index) => ({
        name: label,
        value: chartRes.data.values[index]
      }))
      .sort((a, b) => b.value - a.value);

    setChartData(formatted);

    const statsRes = await axios.get(`${API_URL}/stats/${column}`);
    setStats(statsRes.data);
  };

  const downloadPDF = async () => {
    const report = document.getElementById("report-section");

    if (!report) {
      alert("No report found. Please choose a column first.");
      return;
    }

    try {
      const originalDarkMode = darkMode;

      if (originalDarkMode) {
        setDarkMode(false);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const canvas = await html2canvas(report, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      if (originalDarkMode) {
        setDarkMode(true);
      }

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const finalHeight = Math.min(imgHeight, pageHeight - 20);

      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, finalHeight);
      pdf.save(`${selectedColumn || "research"}_report.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. Check console.");
    }
  };

  return (
    <div className={`page ${darkMode ? "dark" : ""}`}>
      <div className="hero">
        <h1>Research Data Visualization Platform</h1>
        <p>
          Upload a CSV, Excel, or Google Sheets exported dataset, preview the
          data, and generate clean visual analytics.
        </p>

        <div className="theme-toggle">
          <button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2>Upload Dataset</h2>

          <div className="upload-row">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button onClick={uploadFile}>Upload File</button>
          </div>

          {message && <p className="success">{message}</p>}
        </div>

        {columns.length > 0 && (
          <div className="card">
            <h2>Chart Controls</h2>

            <label>Choose Column</label>
            <select onChange={(e) => loadChart(e.target.value)}>
              <option value="">Select a column</option>
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            <label className="control-label">Choose Chart Type</label>
            <select onChange={(e) => setChartType(e.target.value)}>
              <option value="bar">Bar Chart</option>
              <option value="pie">Pie Chart</option>
            </select>
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="pdf-controls">
          <select value={pdfLimit} onChange={(e) => setPdfLimit(e.target.value)}>
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="25">Top 25</option>
            <option value="all">All Results</option>
          </select>

          <button className="download-btn" onClick={downloadPDF}>
            Download Chart Report as PDF
          </button>
        </div>
      )}

      {chartData.length > 0 && (
        <div id="report-section">
          {stats && stats.type === "numeric" && (
            <div className="card">
              <div className="section-header">
                <h2>Statistical Summary for: {selectedColumn}</h2>
                <p>Key statistics for the selected numeric column.</p>
              </div>

              <div className="stats-grid">
                <div className="stat-box">
                  <span>Mean</span>
                  <strong>{stats.mean}</strong>
                </div>

                <div className="stat-box">
                  <span>Median</span>
                  <strong>{stats.median}</strong>
                </div>

                <div className="stat-box">
                  <span>Low</span>
                  <strong>{stats.low}</strong>
                </div>

                <div className="stat-box">
                  <span>High</span>
                  <strong>{stats.high}</strong>
                </div>

                <div className="stat-box">
                  <span>Count</span>
                  <strong>{stats.count}</strong>
                </div>
              </div>
            </div>
          )}

          {stats && stats.type === "non-numeric" && (
            <div className="card">
              <div className="section-header">
                <h2>Statistics for: {stats.column}</h2>
                <p>{stats.message}</p>
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-header">
              <h2>
                {chartType === "bar" ? "Bar Chart" : "Pie Chart"} for:{" "}
                {selectedColumn}
              </h2>
              <p>
                Switch between bar and pie chart views for the selected column.
              </p>
            </div>

            <div className="chart-scroll">
              <div
                className="chart-box"
                style={{
                  width:
                    chartType === "bar"
                      ? `${Math.max(reportChartData.length * 90, 900)}px`
                      : "100%"
                }}
              >
                {chartType === "bar" ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={reportChartData}>
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value">
                        {reportChartData.map((entry, index) => (
                          <Cell
                            key={`bar-cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={500}>
                    <PieChart>
                      <Pie
                        data={reportChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={160}
                        label
                      >
                        {reportChartData.map((entry, index) => (
                          <Cell
                            key={`pie-cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="card">
          <div className="section-header">
            <h2>Data Preview</h2>
            <p>Showing all rows from your uploaded file.</p>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, i) => (
                      <td key={i}>{String(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;