import io
import json
import math
from pathlib import Path

import pandas as pd


SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def wellbeing_frame():
    """The wellbeing sample as pandas reads it, for computing expected values."""
    df = pd.read_csv(SAMPLES / "research_dataset.csv")
    df["annual_income"] = pd.to_numeric(df["annual_income"].str.replace(r"[$,]", "", regex=True))
    return df


def columns_by_name(meta):
    return {c["name"]: c for c in meta["columns"]}


# --------------------------------------------------------------------- basics
def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "ok"
    assert ".csv" in body["extensions"]


def test_samples_listed(client):
    samples = client.get("/api/samples").get_json()["samples"]
    assert {s["id"] for s in samples} == {"wellbeing-survey", "employee-directory"}


def test_unknown_api_route_returns_json_404(client):
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert res.get_json()["error"]["code"] == "not_found"


# ----------------------------------------------------------- type inference
def test_sample_csv_types(sample_csv):
    df = wellbeing_frame()
    cols = columns_by_name(sample_csv)
    assert sample_csv["rows"] == len(df)
    assert sample_csv["column_count"] == len(df.columns)
    assert cols["participant_id"]["is_identifier"]
    assert cols["survey_date"]["kind"] == "datetime"
    assert cols["age_group"]["kind"] == "categorical"
    assert cols["wellbeing_index"]["kind"] == "numeric" and not cols["wellbeing_index"]["discrete"]
    assert cols["exercise_days"]["kind"] == "numeric" and cols["exercise_days"]["discrete"]
    assert cols["meditates"]["kind"] == "boolean"
    # Stored as text like "$52,000" and still read as a number.
    assert cols["annual_income"]["kind"] == "numeric"
    assert cols["annual_income"]["summary"]["min"] == df["annual_income"].min()
    assert cols["annual_income"]["missing"] == int(df["annual_income"].isna().sum())


def test_currency_thousands_and_percent_strings_are_numeric(upload):
    csv = 'name,salary,share\nA,"$52,000",45%\nB,"$61,500.50",50%\nC,"(1,200)",5%\n'
    meta = upload(csv).get_json()
    cols = columns_by_name(meta)
    assert cols["salary"]["kind"] == "numeric"
    assert cols["salary"]["summary"]["min"] == -1200
    assert cols["salary"]["summary"]["max"] == 61500.5
    assert cols["share"]["kind"] == "numeric"


def test_mostly_text_column_is_not_numeric(upload):
    # The original app called a column "numeric" if even one value parsed.
    rows = "\n".join(f"r{i},label{i % 3}" for i in range(30))
    meta = upload("id,value\n" + rows + "\nr30,42\n").get_json()
    assert columns_by_name(meta)["value"]["kind"] == "categorical"


def test_leading_zero_codes_stay_text(upload):
    meta = upload("zip,n\n01234,1\n02139,2\n10001,3\n").get_json()
    assert columns_by_name(meta)["zip"]["kind"] == "categorical"


def test_semicolon_delimiter_decimal_comma_and_latin1(upload):
    content = "ville;température;score\nMontréal;3,5;10\nQuébec;-2,25;12\nLyon;7,0;9\n"
    meta = upload(content.encode("cp1252"), "fr.csv").get_json()
    cols = columns_by_name(meta)
    assert list(cols) == ["ville", "température", "score"]
    assert cols["température"]["kind"] == "numeric"
    assert cols["température"]["summary"]["min"] == -2.25


def test_dates_and_booleans(upload):
    csv = "when,flag\n2024-01-05,yes\n2024-02-10,no\n2024-03-15,yes\n2024-03-20,YES\n"
    meta = upload(csv).get_json()
    cols = columns_by_name(meta)
    assert cols["when"]["kind"] == "datetime"
    assert cols["flag"]["kind"] == "boolean"
    assert cols["flag"]["summary"]["true_pct"] == 75.0


def test_blank_rows_whitespace_and_duplicate_headers_cleaned(upload):
    csv = "a,a,b\n1, x ,\n,,\n2,y,  \n"
    meta = upload(csv).get_json()
    assert meta["rows"] == 2
    names = [c["name"] for c in meta["columns"]]
    assert len(set(names)) == 3
    assert columns_by_name(meta)["b"]["kind"] == "empty"


# ------------------------------------------------------------------ uploads
def test_unsupported_extension_rejected_and_not_saved(upload, settings):
    res = upload("hello", "notes.pdf")
    assert res.status_code == 415
    assert "aren't supported" in res.get_json()["error"]["message"]
    assert not any(settings.data_dir.iterdir())


def test_unreadable_file_cleans_up(upload, settings):
    res = upload(b"", "empty.csv")
    assert res.status_code == 422
    assert res.get_json()["error"]["message"] == "The file is empty."
    assert not any(settings.data_dir.iterdir())


def test_corrupt_excel_reports_readable_error(upload):
    res = upload(b"not really a workbook", "fake.xlsx")
    assert res.status_code == 422
    assert "Excel" in res.get_json()["error"]["message"]


def test_path_traversal_filename_is_harmless(upload, settings, tmp_path):
    res = upload("a,b\n1,2\n", "../../evil.csv")
    assert res.status_code == 201
    meta = res.get_json()
    assert meta["name"] == "evil.csv"
    assert not (tmp_path / "evil.csv").exists()
    assert (settings.data_dir / meta["id"] / "source.csv").exists()


def test_oversized_upload_returns_413(upload):
    big = "a\n" + ("1234567890\n" * 600_000)  # ~6.6 MB, limit is 5 MB in tests
    res = upload(big)
    assert res.status_code == 413
    assert "5 MB" in res.get_json()["error"]["message"]


def test_datasets_are_isolated(upload):
    # The original kept one global DataFrame shared by every user.
    first = upload("x\n1\n", "one.csv").get_json()
    second = upload("y\n2\n", "two.csv").get_json()
    assert first["id"] != second["id"]
    assert [c["name"] for c in first["columns"]] == ["x"]


def test_dataset_reloads_from_disk_after_eviction(app, upload, client):
    meta = upload("x\n1\n2\n").get_json()
    store = app.extensions["rdp_store"]
    store._cache.clear()
    res = client.get(f"/api/datasets/{meta['id']}")
    assert res.status_code == 200
    assert res.get_json()["rows"] == 2


def test_invalid_and_missing_ids_404(client):
    assert client.get("/api/datasets/../../etc").status_code == 404
    assert client.get("/api/datasets/" + "0" * 32).status_code == 404


def test_delete(client, sample_csv):
    ds = sample_csv["id"]
    assert client.delete(f"/api/datasets/{ds}").status_code == 200
    assert client.get(f"/api/datasets/{ds}").status_code == 404


# -------------------------------------------------------------------- excel
def test_excel_sheets_and_switching(client):
    res = client.post("/api/samples/employee-directory")
    meta = res.get_json()
    assert meta["sheets"] == ["Employee Directory", "Department Summary", "Performance Reviews"]
    assert meta["sheet"] == "Employee Directory"
    cols = columns_by_name(meta)
    assert cols["Salary ($)"]["kind"] == "numeric"
    assert cols["Hire Date"]["kind"] == "datetime"
    assert cols["Remote Eligible"]["kind"] == "boolean"
    # Boston's ZIP 02110 keeps its leading zero.
    assert cols["Office ZIP"]["kind"] == "categorical"

    summary = client.post(
        f"/api/datasets/{meta['id']}/sheet", json={"sheet": "Department Summary"}
    ).get_json()
    assert summary["sheet"] == "Department Summary"
    # Values come from live formulas; the cached results must be read.
    assert columns_by_name(summary)["Avg Salary ($)"]["valid"] == summary["rows"]

    reviews = client.post(
        f"/api/datasets/{meta['id']}/sheet", json={"sheet": "Performance Reviews"}
    ).get_json()
    assert columns_by_name(reviews)["Review Date"]["kind"] == "datetime"
    assert columns_by_name(reviews)["Rating (1-5)"]["discrete"]

    bad = client.post(f"/api/datasets/{meta['id']}/sheet", json={"sheet": "Nope"})
    assert bad.status_code == 422


# ----------------------------------------------------------------- analysis
def test_continuous_numeric_gets_histogram_with_round_edges(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(f"/api/datasets/{sample_csv['id']}/analysis", query_string={"column": "annual_income"})
    body = res.get_json()
    dist = body["distribution"]
    assert dist["type"] == "histogram"
    assert sum(item["count"] for item in dist["items"]) == df["annual_income"].notna().sum()
    assert all(item["start"] % 1000 == 0 for item in dist["items"])
    assert body["stats"]["median"] == df["annual_income"].median()
    assert body["stats"]["q1"] <= body["stats"]["median"] <= body["stats"]["q3"]


def test_custom_bin_count(client, sample_csv):
    res = client.get(
        f"/api/datasets/{sample_csv['id']}/analysis",
        query_string={"column": "annual_income", "bins": 5},
    )
    assert 4 <= len(res.get_json()["distribution"]["items"]) <= 7


def test_discrete_numeric_gets_one_bar_per_value(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(f"/api/datasets/{sample_csv['id']}/analysis", query_string={"column": "exercise_days"})
    dist = res.get_json()["distribution"]
    assert dist["type"] == "discrete"
    assert [i["label"] for i in dist["items"]] == [str(v) for v in sorted(df["exercise_days"].unique())]


def test_categorical_top_n_with_other_bucket(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(f"/api/datasets/{sample_csv['id']}/analysis", query_string={"column": "city", "top": 2})
    dist = res.get_json()["distribution"]
    assert dist["type"] == "categorical"
    assert len(dist["items"]) == 2
    assert dist["items"][0]["label"] == df["city"].value_counts().index[0]
    assert dist["other"]["categories"] == df["city"].nunique() - 2
    assert sum(i["count"] for i in dist["items"]) + dist["other"]["count"] == len(df)


def test_identifier_has_no_chart(client, sample_csv):
    res = client.get(f"/api/datasets/{sample_csv['id']}/analysis", query_string={"column": "participant_id"})
    assert res.get_json()["distribution"]["type"] == "none"


def test_column_names_with_url_characters(upload, client):
    # The original put column names in the URL path, which broke on / # ? %.
    meta = upload('Income/Year,"Score #1?",Rate %\n10,1,2\n20,2,3\n').get_json()
    for name in ["Income/Year", "Score #1?", "Rate %"]:
        res = client.get(f"/api/datasets/{meta['id']}/analysis", query_string={"column": name})
        assert res.status_code == 200, name
        assert res.get_json()["column"] == name


def test_unknown_column_404(client, sample_csv):
    res = client.get(f"/api/datasets/{sample_csv['id']}/analysis", query_string={"column": "nope"})
    assert res.status_code == 404


def test_infinity_and_nan_serialize_as_valid_json(upload, client):
    meta = upload("v,w\n1,inf\n2,\n3,-inf\n").get_json()
    res = client.get(f"/api/datasets/{meta['id']}/rows")
    text = res.get_data(as_text=True)
    assert "NaN" not in text and "Infinity" not in text
    json.loads(text)
    stats = client.get(
        f"/api/datasets/{meta['id']}/analysis", query_string={"column": "w"}
    ).get_json()["stats"]
    assert stats["missing"] == 3


def test_datetime_timeline(upload, client):
    csv = "d\n" + "\n".join(f"2024-{m:02d}-15" for m in [1, 1, 3, 4, 4, 4]) + "\n"
    meta = upload(csv).get_json()
    dist = client.get(
        f"/api/datasets/{meta['id']}/analysis", query_string={"column": "d"}
    ).get_json()["distribution"]
    assert dist["type"] == "timeline"
    assert [i["label"] for i in dist["items"]] == ["2024-01", "2024-02", "2024-03", "2024-04"]
    assert [i["count"] for i in dist["items"]] == [2, 0, 1, 3]


# ---------------------------------------------------------------- aggregate
def test_aggregate_mean_by_group(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(
        f"/api/datasets/{sample_csv['id']}/aggregate",
        query_string={"group_by": "education_level", "metric": "annual_income", "agg": "mean"},
    )
    body = res.get_json()
    assert res.status_code == 200
    expected = df.groupby("education_level")["annual_income"].mean().sort_values(ascending=False)
    assert [i["label"] for i in body["items"]] == list(expected.index)
    assert body["items"][0]["label"] == "PhD"
    assert body["items"][0]["value"] == round(expected.iloc[0], 4)
    assert sum(i["rows"] for i in body["items"]) == len(df)


def test_aggregate_count_and_discrete_groups_sorted_by_label(client, sample_csv):
    res = client.get(
        f"/api/datasets/{sample_csv['id']}/aggregate",
        query_string={"group_by": "stress_level", "agg": "count"},
    )
    body = res.get_json()
    labels = [int(i["label"]) for i in body["items"]]
    assert labels == sorted(labels)


def test_aggregate_rejects_identifier_and_text_metric(client, sample_csv):
    ds = sample_csv["id"]
    res = client.get(f"/api/datasets/{ds}/aggregate", query_string={"group_by": "participant_id", "agg": "count"})
    assert res.status_code == 400
    res = client.get(
        f"/api/datasets/{ds}/aggregate",
        query_string={"group_by": "city", "metric": "gender", "agg": "mean"},
    )
    assert res.status_code == 400


# --------------------------------------------------------------------- rows
def test_rows_pagination(client, sample_csv):
    total = len(wellbeing_frame())
    res = client.get(f"/api/datasets/{sample_csv['id']}/rows", query_string={"page": 2, "page_size": 15})
    body = res.get_json()
    assert body["total"] == total and body["pages"] == math.ceil(total / 15) and body["page"] == 2
    assert len(body["rows"]) == 15
    assert body["row_numbers"][0] == 16


def test_rows_sort_numeric_desc(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(
        f"/api/datasets/{sample_csv['id']}/rows",
        query_string={"sort": "wellbeing_index", "order": "desc", "page_size": 3},
    )
    body = res.get_json()
    col = body["columns"].index("wellbeing_index")
    assert [r[col] for r in body["rows"]] == df["wellbeing_index"].nlargest(3).tolist()


def test_rows_search(client, sample_csv):
    df = wellbeing_frame()
    res = client.get(f"/api/datasets/{sample_csv['id']}/rows", query_string={"q": "chattanooga"})
    body = res.get_json()
    assert body["total"] == int((df["city"] == "Chattanooga").sum())
    col = body["columns"].index("city")
    assert all(r[col] == "Chattanooga" for r in body["rows"])


def test_rows_bad_params(client, sample_csv):
    ds = sample_csv["id"]
    assert client.get(f"/api/datasets/{ds}/rows", query_string={"page_size": 0}).status_code == 400
    assert client.get(f"/api/datasets/{ds}/rows", query_string={"order": "sideways"}).status_code == 400
    assert client.get(f"/api/datasets/{ds}/rows", query_string={"sort": "nope"}).status_code == 404


def test_xls_legacy_excel(upload, tmp_path):
    # Build a tiny .xls-compatible workbook via pandas if xlwt is unavailable: skip gracefully.
    try:
        import xlwt  # noqa: F401
    except ImportError:
        import pytest

        pytest.skip("xlwt not installed; .xls writing unavailable in this environment")
    path = tmp_path / "t.xls"
    pd.DataFrame({"a": [1, 2]}).to_excel(path, index=False, engine="xlwt")
    res = upload(path.read_bytes(), "t.xls")
    assert res.status_code == 201


def test_excel_mixed_types_times_and_timezones(upload, tmp_path):
    import datetime as dt

    frame = pd.DataFrame(
        {
            "mixed": [1, "two", 3.5, None],
            "clock": [dt.time(9, 30), dt.time(10, 0), dt.time(11, 15), dt.time(12, 0)],
            "stamp": pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01", None]),
        }
    )
    path = tmp_path / "mixed.xlsx"
    frame.to_excel(path, index=False)
    res = upload(path.read_bytes(), "mixed.xlsx")
    assert res.status_code == 201, res.get_json()
    cols = columns_by_name(res.get_json())
    assert cols["stamp"]["kind"] == "datetime"
    assert cols["mixed"]["kind"] == "categorical"


def test_timezone_aware_iso_strings(upload, client):
    csv = "t\n2024-01-01T10:00:00+02:00\n2024-01-02T10:00:00-05:00\n2024-01-03T10:00:00Z\n"
    meta = upload(csv).get_json()
    col = columns_by_name(meta)["t"]
    assert col["kind"] == "datetime"
    res = client.get(f"/api/datasets/{meta['id']}/analysis", query_string={"column": "t"})
    assert res.status_code == 200


def test_mostly_unique_labels_are_text_not_categories(client):
    # Names and emails with a couple of duplicates shouldn't be offered as groups.
    meta = client.post("/api/samples/employee-directory").get_json()
    cols = columns_by_name(meta)
    assert cols["Full Name"]["kind"] == "text"
    assert cols["Email"]["kind"] == "text"
    assert cols["Department"]["kind"] == "categorical"
    assert cols["Job Title"]["kind"] == "categorical"


def test_discrete_means_a_small_range_not_just_few_rows(client):
    meta = client.post("/api/samples/employee-directory").get_json()
    summary = client.post(
        f"/api/datasets/{meta['id']}/sheet", json={"sheet": "Department Summary"}
    ).get_json()
    cols = columns_by_name(summary)
    assert cols["Total Payroll ($)"]["kind"] == "numeric"
    assert not cols["Total Payroll ($)"]["discrete"]
    assert cols["Head Count"]["discrete"]


def test_excel_text_codes_keep_leading_zeros(upload, tmp_path):
    # pandas.read_excel turns the text "02139" into 2139.0 unless told not to.
    frame = pd.DataFrame(
        {
            "zip": ["02139", "10001", "01002", "94105"] * 3,
            "code": [f"{i:03d}" for i in range(12)],
            "n": list(range(12)),
            "when": pd.date_range("2024-01-01", periods=12),
            "ok": [True, False] * 6,
            "amount": ["$1,200", "$950"] * 6,
        }
    )
    path = tmp_path / "codes.xlsx"
    frame.to_excel(path, index=False)
    meta = upload(path.read_bytes(), "codes.xlsx").get_json()
    cols = columns_by_name(meta)
    assert cols["zip"]["kind"] == "categorical"
    assert cols["code"]["kind"] == "text" and cols["code"]["is_identifier"]
    # Everything else is still typed as before.
    assert cols["n"]["kind"] == "numeric"
    assert cols["when"]["kind"] == "datetime"
    assert cols["ok"]["kind"] == "boolean"
    assert cols["amount"]["kind"] == "numeric"
