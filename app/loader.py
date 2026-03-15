from pathlib import Path

import pandas as pd

from app.state import state

REQUIRED_COLUMNS = {
    "employees": ["employee_id", "name", "department", "job_title"],
    "vendors": ["vendor_id", "name", "created_by", "created_date"],
    "invoices": ["invoice_id", "vendor_id", "amount", "created_by", "date"],
    "approvals": ["invoice_id", "approved_by"],
    "transactions": ["transaction_id", "invoice_id", "amount", "date"],
}

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _clean_dataset(name: str, df: pd.DataFrame, required_cols: list) -> tuple:
    """
    Apply full cleaning pipeline to a single dataset.
    Returns (cleaned_df, cleaning_log_dict).
    """
    log = {
        "dataset": name,
        "original_row_count": len(df),
        "issues": [],
    }

    # 1. Strip whitespace from all string columns
    str_cols = df.select_dtypes(include="object").columns
    for col in str_cols:
        before = df[col].copy()
        df[col] = df[col].str.strip()
        changed = (before != df[col]).sum()
        if changed:
            log["issues"].append(f"{col}: stripped leading/trailing whitespace from {changed} value(s)")

    # 2. Normalize string columns to lowercase for consistent comparison
    # (only ID and user columns — preserve vendor names for display)
    id_cols = [c for c in df.columns if c.endswith("_id") or c.startswith("created_by") or c == "approved_by"]
    for col in id_cols:
        if col in df.columns:
            df[col] = df[col].str.lower()

    # 3. Drop rows missing any required column
    before_count = len(df)
    df = df.dropna(subset=required_cols)
    dropped = before_count - len(df)
    if dropped:
        log["issues"].append(f"Dropped {dropped} row(s) with null values in required columns")

    # 4. Drop fully duplicate rows
    before_count = len(df)
    df = df.drop_duplicates()
    dropped = before_count - len(df)
    if dropped:
        log["issues"].append(f"Dropped {dropped} fully duplicate row(s)")

    # 5. Drop rows with duplicate primary key (keep first occurrence, log the rest)
    pk = required_cols[0]  # First required column is always the primary key
    before_count = len(df)
    df = df.drop_duplicates(subset=[pk], keep="first")
    dropped = before_count - len(df)
    if dropped:
        log["issues"].append(f"Dropped {dropped} row(s) with duplicate primary key '{pk}' (kept first)")

    # 6. Validate amounts are non-negative where applicable
    if "amount" in df.columns:
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        negative = (df["amount"] < 0).sum()
        if negative:
            df = df[df["amount"] >= 0]
            log["issues"].append(f"Removed {negative} row(s) with negative amount values")
        nulls_after = df["amount"].isna().sum()
        if nulls_after:
            df = df.dropna(subset=["amount"])
            log["issues"].append(f"Removed {nulls_after} row(s) where amount could not be parsed as numeric")

    log["cleaned_row_count"] = len(df)
    log["rows_removed"] = log["original_row_count"] - log["cleaned_row_count"]
    log["clean"] = len(log["issues"]) == 0

    return df, log


def load_all_datasets() -> dict:
    results = {}
    cleaning_logs = []

    for name, required_cols in REQUIRED_COLUMNS.items():
        path = DATA_DIR / f"{name}.csv"
        if not path.exists():
            raise FileNotFoundError(f"{name}.csv not found in the data/ directory")

        df = pd.read_csv(path)

        missing = set(required_cols) - set(df.columns)
        if missing:
            raise ValueError(f"{name}.csv is missing required columns: {missing}")

        df, log = _clean_dataset(name, df, required_cols)
        cleaning_logs.append(log)
        results[name] = df

    # Type coercions after cleaning
    results["vendors"]["created_date"] = pd.to_datetime(results["vendors"]["created_date"])
    results["invoices"]["date"] = pd.to_datetime(results["invoices"]["date"])
    results["invoices"]["amount"] = results["invoices"]["amount"].astype(float)
    results["transactions"]["date"] = pd.to_datetime(results["transactions"]["date"])
    results["transactions"]["amount"] = results["transactions"]["amount"].astype(float)

    state.employees = results["employees"]
    state.vendors = results["vendors"]
    state.invoices = results["invoices"]
    state.approvals = results["approvals"]
    state.transactions = results["transactions"]
    state.cleaning_report = cleaning_logs

    return results
