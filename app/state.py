from dataclasses import dataclass, field
from typing import Optional

import pandas as pd
import networkx as nx


@dataclass
class AppState:
    employees: Optional[pd.DataFrame] = None
    vendors: Optional[pd.DataFrame] = None
    invoices: Optional[pd.DataFrame] = None
    approvals: Optional[pd.DataFrame] = None
    transactions: Optional[pd.DataFrame] = None
    graph: Optional[nx.DiGraph] = None
    risk_findings: list = field(default_factory=list)
    audit_session: Optional[dict] = None
    investigation_report: Optional[dict] = None
    cleaning_report: Optional[list] = None


# Single shared instance used by all modules
state = AppState()
