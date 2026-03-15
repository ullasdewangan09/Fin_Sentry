from pydantic import BaseModel
from typing import List


class UploadResponse(BaseModel):
    message: str
    datasets_loaded: int
    summary: dict


class GraphResponse(BaseModel):
    message: str
    nodes: int
    edges: int
    node_types: dict


class RiskDetectionResponse(BaseModel):
    message: str
    total_risks: int
    risk_types: List[str]
    audit_session: dict


class InvestigationReport(BaseModel):
    total_risks: int
    findings: List[dict]
    narrative: str
