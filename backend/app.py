from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import os

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

latest_data = None


@app.route("/")
def home():
    return jsonify({"message": "Research Data Visualization API is running"})


@app.route("/upload", methods=["POST"])
def upload_file():
    global latest_data

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    
    filename = file.filename.lower()
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    try:
        if filename.endswith(".csv"):
            latest_data = pd.read_csv(filepath)
        elif filename.endswith((".xlsx")):
            latest_data = pd.read_excel(filepath, engine="openpyxl")
        elif filename.endswith(".xls"):
            latest_data = pd.read_excel(filepath, engine="xlrd")
        else:
            return jsonify({"error": "Unsupported file type"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
    return jsonify ({
        "message": "File uploaded successfully",
        "columns": latest_data.columns.tolist(),
        "rows": len(latest_data)
    })

@app.route("/summary", methods=["GET"])
def get_summary():
    if latest_data is None:
        return jsonify({"error": "No data uploaded yet"}), 400

    summary = latest_data.describe(include="all").fillna("").to_dict()

    return jsonify({
        "columns": latest_data.columns.tolist(),
        "preview": latest_data.fillna("").to_dict(orient="records"),
        "summary": summary
    })

@app.route("/stats/<column>", methods=["GET"])
def column_stats(column):
    if latest_data is None:
        return jsonify({"error": "No data uploaded yet"}), 400

    if column not in latest_data.columns:
        return jsonify({"error": "Column not found"}), 404

    cleaned_column = (
        latest_data[column]
        .astype(str)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.strip()
    )

    numeric_column = pd.to_numeric(cleaned_column, errors="coerce").dropna()

    if numeric_column.empty:
        return jsonify({
            "column": str(column),
            "type": "non-numeric",
            "message": "Stats are only available for numeric columns."
        })

    return jsonify({
        "column": str(column),
        "type": "numeric",
        "mean": float(round(numeric_column.mean(), 2)),
        "median": float(round(numeric_column.median(), 2)),
        "low": float(round(numeric_column.min(), 2)),
        "high": float(round(numeric_column.max(), 2)),
        "count": int(numeric_column.count())
    })


@app.route("/chart-data/<column>", methods=["GET"])
def chart_data(column):
    if latest_data is None:
        return jsonify({"error": "No data uploaded yet"}), 400

    if column not in latest_data.columns:
        return jsonify({"error": "Column not found"}), 404

    counts = latest_data[column].value_counts()

    return jsonify({
        "labels": counts.index.astype(str).tolist(),
        "values": counts.values.tolist()
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)