from dotenv import load_dotenv

load_dotenv()  # Must run before any module that reads env vars

import io
import json
import math
import os
import zipfile
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend — must be set before pyplot import
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import networkx as nx

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.graph import build_graph
from app.investigator import generate_report
from app.loader import load_all_datasets
from app.risk import run_all_detections
from app.state import state
from app.transaction_tester import run_transaction_tests
from app.agents.supervisor import run_audit_pipeline
from app.auth import bootstrap_users, create_access_token, decode_access_token, user_store
from app.audit_log import record_audit_event
from app.security_config import enforce_or_warn_secret_configuration

# ── Optional rate-limiting (graceful degradation if slowapi not installed) ──
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler  # type: ignore
    from slowapi.util import get_remote_address  # type: ignore
    from slowapi.errors import RateLimitExceeded  # type: ignore
    _limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
    _RATE_LIMIT_AVAILABLE = True
except ImportError:
    _RATE_LIMIT_AVAILABLE = False
    _limiter = None


def _rate_limit(rule: str):
    """Apply per-route limits when slowapi is installed; otherwise no-op."""

    def _decorator(func):
        if _RATE_LIMIT_AVAILABLE and _limiter is not None:
            return _limiter.limit(rule)(func)
        return func

    return _decorator

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Single startup/shutdown lifecycle handler (replaces deprecated on_event)."""
    # 1. Secret validation + demo user bootstrap
    enforce_or_warn_secret_configuration()
    bootstrap_users()

    # 2. Proactive audit pipeline — data is ready before the first request
    try:
        load_all_datasets()
        build_graph()
        findings = run_all_detections()
        state.audit_session = {
            "run_at": datetime.now(timezone.utc).isoformat(),
            "records_analyzed": {
                "employees": len(state.employees) if state.employees is not None else 0,
                "vendors": len(state.vendors),
                "invoices": len(state.invoices),
                "approvals": len(state.approvals),
                "transactions": len(state.transactions),
            },
            "findings_count": len(findings),
        }
        print(
            f"[AUTO-AUDIT] Startup pipeline complete — "
            f"{len(findings)} risk finding(s) detected across "
            f"{state.graph.number_of_nodes()} nodes / {state.graph.number_of_edges()} edges."
        )
    except Exception as exc:
        print(f"[AUTO-AUDIT] Startup pipeline failed — {exc}")

    yield  # Application serves requests here
    # (no shutdown cleanup needed)


app = FastAPI(
    title="Decision & Financial Digital Twin Platform",
    description="Hackathon backend prototype — Deloitte Hackplosion 2026",
    version="0.2.0",
    lifespan=lifespan,
)

if _RATE_LIMIT_AVAILABLE and _limiter is not None:
    app.state.limiter = _limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow the Vite dev server, local origins, and production frontend to reach the API.
# Override or extend via CORS_ALLOWED_ORIGINS env var (comma-separated URLs).
_DEFAULT_ORIGINS = [
    # Dev
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    # Production
    "https://finsentry.xyz",
    "https://www.finsentry.xyz",
    "https://app.finsentry.xyz",
    "https://api.finsentry.xyz",
]
_extra_origins = [
    o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
_ALLOWED_ORIGINS = _DEFAULT_ORIGINS + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Attach recommended security headers to every HTTP response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ── OAuth2 bearer scheme ────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)
READ_ROLES = ("admin", "auditor", "risk_analyst")
OPERATE_ROLES = ("admin", "risk_analyst")


async def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    """FastAPI dependency — validates JWT and returns {username, role}."""
    bearer_token = token

    # EventSource in browsers cannot set Authorization headers directly.
    # Allow a query-string token only for the SSE audit stream endpoint.
    if bearer_token is None and request.url.path == "/run-audit/stream":
        bearer_token = request.query_params.get("access_token")

    if bearer_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        decoded = decode_access_token(bearer_token)
        request.state.current_user = decoded
        return decoded
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


def require_role(*roles: str):
    """Dependency factory — raises 403 if the authenticated user's role isn't in *roles*."""
    async def _check(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied — required roles: {', '.join(roles)}",
            )
        return user
    return Depends(_check)


def _is_auditor(request: Request) -> bool:
    user = getattr(request.state, "current_user", None)
    return isinstance(user, dict) and user.get("role") == "auditor"


def _mask_vendor_name(vendor_id: Any) -> str:
    return str(vendor_id) if vendor_id is not None else "REDACTED"


def _redact_vendor_data(value: Any) -> Any:
    """Recursively redact vendor names while preserving vendor IDs for auditors."""
    if isinstance(value, list):
        return [_redact_vendor_data(v) for v in value]

    if isinstance(value, dict):
        redacted = {k: _redact_vendor_data(v) for k, v in value.items()}

        if "vendor_id" in redacted:
            masked_name = _mask_vendor_name(redacted.get("vendor_id"))
            if "vendor" in redacted:
                redacted["vendor"] = masked_name
            if "vendor_name" in redacted:
                redacted["vendor_name"] = masked_name

        if redacted.get("node_type") == "vendor" and "id" in redacted and "name" in redacted:
            redacted["name"] = str(redacted["id"])

        return redacted

    return value


# Startup logic is handled by the lifespan context manager defined above.


# ---------------------------------------------------------------------------
# Authentication endpoint
# ---------------------------------------------------------------------------

@app.post("/auth/token", tags=["auth"])
@_rate_limit("10/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 password-flow token endpoint.
    Exchange username + password for a signed JWT.

    Demo credentials
    ----------------
    admin   / Admin@12345
    auditor / Audit@12345
    analyst / Analyst@12345
    """
    try:
        user = user_store.authenticate(form_data.username, form_data.password)
    except PermissionError as exc:
        record_audit_event(
            actor=form_data.username,
            role="unknown",
            action="auth.login",
            outcome="failure",
            resource="/auth/token",
            details={"reason": "locked_out"},
        )
        raise HTTPException(status_code=429, detail=str(exc))

    if user is None:
        record_audit_event(
            actor=form_data.username,
            role="unknown",
            action="auth.login",
            outcome="failure",
            resource="/auth/token",
            details={"reason": "invalid_credentials"},
        )
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(username=user["username"], role=user["role"])
    record_audit_event(
        actor=user["username"],
        role=user["role"],
        action="auth.login",
        outcome="success",
        resource="/auth/token",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
    }


@app.get("/auth/me", tags=["auth"])
async def who_am_i(user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return user





@app.post("/upload-data", dependencies=[require_role(*OPERATE_ROLES)])
def upload_data(request: Request):
    """Load all CSV datasets from the data/ directory into in-memory state."""
    # Reset all derived state before loading so stale data never persists
    state.graph = None
    state.risk_findings = []
    state.audit_session = None
    state.investigation_report = None
    state.cleaning_report = None

    try:
        results = load_all_datasets()
        user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
        record_audit_event(
            actor=user.get("username", "unknown"),
            role=user.get("role", "unknown"),
            action="data.upload",
            outcome="success",
            resource="/upload-data",
            details={"datasets_loaded": len(results)},
        )
        return {
            "message": "Datasets loaded successfully",
            "datasets_loaded": len(results),
            "summary": {name: len(df) for name, df in results.items()},
        }
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/build-graph", dependencies=[require_role(*OPERATE_ROLES)])
def build_digital_twin(request: Request):
    """Construct the typed financial digital twin graph from loaded datasets."""
    if state.vendors is None:
        raise HTTPException(
            status_code=400,
            detail="Data not loaded. Call POST /upload-data first.",
        )

    G = build_graph()

    node_types = {
        nt: sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == nt)
        for nt in ["employee", "vendor", "vendor_creation", "invoice", "approval_decision", "transaction"]
    }

    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="graph.build",
        outcome="success",
        resource="/build-graph",
        details={"nodes": G.number_of_nodes(), "edges": G.number_of_edges()},
    )

    return {
        "message": "Financial digital twin built successfully",
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
        "node_types": node_types,
    }


@app.post("/detect-risk", dependencies=[require_role(*OPERATE_ROLES)])
def detect_risk(request: Request):
    """Run all rule-based risk detection against the digital twin graph."""
    if state.graph is None:
        raise HTTPException(
            status_code=400,
            detail="Graph not built. Call POST /build-graph first.",
        )

    findings = run_all_detections()

    audit_session = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "records_analyzed": {
            "employees": len(state.employees) if state.employees is not None else 0,
            "vendors": len(state.vendors),
            "invoices": len(state.invoices),
            "approvals": len(state.approvals),
            "transactions": len(state.transactions),
        },
        "findings_count": len(findings),
    }
    state.audit_session = audit_session

    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="risk.detect",
        outcome="success",
        resource="/detect-risk",
        details={"findings": len(findings)},
    )

    return {
        "message": f"{len(findings)} risk pathway(s) detected",
        "total_risks": len(findings),
        "risk_types": [f["risk_type"] for f in findings],
        "audit_session": audit_session,
    }


@app.get("/investigation", dependencies=[require_role(*READ_ROLES)])
def get_investigation(request: Request):
    """Return the full structured investigation report with AI-generated narrative."""
    if not state.risk_findings:
        raise HTTPException(
            status_code=400,
            detail="No risk findings available. Call POST /detect-risk first.",
        )

    report = generate_report()
    if _is_auditor(request):
        report = _redact_vendor_data(report)
    return report


@app.get("/risk-findings", dependencies=[require_role(*READ_ROLES)])
def risk_findings_summary(request: Request):
    """
    Return current risk findings without triggering LLM narrative generation.
    Fast — findings are pre-computed at startup. AI narrative requires /run-audit/stream.
    """
    if not state.risk_findings:
        raise HTTPException(
            status_code=400,
            detail="No risk findings available. Run detection first.",
        )
    payload = {
        "findings": state.risk_findings,
        "total_risks": len(state.risk_findings),
        "audit_session": state.audit_session,
        "narrative": None,
    }
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


@app.get("/data-quality-report", dependencies=[require_role(*READ_ROLES)])
def data_quality_report():
    """Return the cleaning report produced when data was last uploaded."""
    if state.cleaning_report is None:
        raise HTTPException(
            status_code=400,
            detail="No data loaded yet. Call POST /upload-data first.",
        )

    total_issues = sum(len(log["issues"]) for log in state.cleaning_report)
    return {
        "message": "Data quality report",
        "datasets_checked": len(state.cleaning_report),
        "total_issues_found": total_issues,
        "overall_clean": total_issues == 0,
        "details": state.cleaning_report,
    }


@app.post("/test-transactions", dependencies=[require_role(*OPERATE_ROLES)])
def test_transactions():
    """Run 5 internal controls against every loaded transaction and return pass/fail results."""
    if state.graph is None:
        raise HTTPException(
            status_code=400,
            detail="Graph not built. Call POST /build-graph first.",
        )

    try:
        report = run_transaction_tests()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return report


@app.post("/run-audit", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("6/minute")
def run_audit(request: Request, prompt: str = "Run the full financial audit pipeline."):
    """
    Trigger the autonomous two-agent audit pipeline end-to-end.

    Agent 1 — Data & Detection (Steps 1-3):
      loads & cleans data → builds financial digital twin graph → detects fraud risks

    Agent 2 — Investigation & Reporting (Steps 4-6):
      tests all transactions → generates LLM executive audit narrative

    A LangGraph supervisor orchestrates routing between the two agents.
    This single endpoint replaces the manual 5-step call sequence.
    """
    try:
        result = run_audit_pipeline(prompt)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}")

    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="audit.pipeline.run",
        outcome="success",
        resource="/run-audit",
    )

    return result


@app.get("/run-audit/stream", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("6/minute")
async def run_audit_stream(request: Request, prompt: str = Query("Run the full financial audit pipeline.")):
    """
    SSE streaming version of the two-agent audit pipeline.
    Emits server-sent events as each agent step completes so the frontend
    can show real-time agent activity and a word-by-word narrative.

    Event types: start | routing | agent_step | complete | error
    """
    import asyncio as _asyncio
    from concurrent.futures import ThreadPoolExecutor

    async def event_gen():
        queue: _asyncio.Queue = _asyncio.Queue()
        loop = _asyncio.get_running_loop()

        def _run():
            try:
                from app.agents.supervisor import get_audit_graph
                from langchain_core.messages import HumanMessage

                state.graph = None
                state.risk_findings = []
                state.audit_session = None
                state.investigation_report = None
                state.cleaning_report = None

                audit_graph = get_audit_graph()
                initial = {
                    "messages": [HumanMessage(content=prompt)],
                    "next": "data_agent",
                }

                for update in audit_graph.stream(
                    initial,
                    {"recursion_limit": 40},
                    stream_mode="updates",
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, {"update": update})

                loop.call_soon_threadsafe(queue.put_nowait, {"done": True})
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, {"error": str(exc)})

        def sse(event_type: str, data: dict) -> str:
            return f"data: {json.dumps({'type': event_type, **data})}\n\n"

        _asyncio.ensure_future(_asyncio.to_thread(_run))

        yield sse("start", {"message": "Audit pipeline initialising…"})

        while True:
            item = await queue.get()
            if "done" in item:
                narrative = ""
                if state.investigation_report:
                    narrative = state.investigation_report.get("narrative", "")
                yield sse("complete", {
                    "findings_count": len(state.risk_findings),
                    "narrative": narrative,
                    "findings": state.risk_findings,
                    "total_risks": len(state.risk_findings),
                    "audit_session": state.audit_session,
                })
                break
            elif "error" in item:
                yield sse("error", {"message": item["error"]})
                break
            else:
                update = item["update"]
                for node_name, node_data in update.items():
                    if node_name == "supervisor":
                        nxt = node_data.get("next", "")
                        if nxt:
                            yield sse("routing", {"next": nxt})
                    elif node_name in ("data_agent", "investigation_agent"):
                        for msg in node_data.get("messages", []):
                            content = getattr(msg, "content", str(msg))
                            if content:
                                yield sse("agent_step", {
                                    "agent": node_name,
                                    "content": content,
                                })

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/policy", dependencies=[require_role(*READ_ROLES)])
def get_policy():
    """
    Return the active policy configuration.
    Policy is ingested from data/policy.json at server startup.
    Edit that file and restart to change thresholds without code changes.
    """
    from app.policy import POLICY, _POLICY_PATH, get_control_catalog
    return {
        "source": _POLICY_PATH if os.path.exists(_POLICY_PATH) else "built-in defaults",
        "invoice_approval_threshold": POLICY.invoice_approval_threshold,
        "large_payment_threshold": POLICY.large_payment_threshold,
        "senior_approvers": sorted(POLICY.senior_approvers),
        "invoice_splitting_window_days": POLICY.invoice_splitting_window_days,
        "invoice_splitting_min_count": POLICY.invoice_splitting_min_count,
        "rapid_payment_max_days": POLICY.rapid_payment_max_days,
        "dormancy_threshold_days": POLICY.dormancy_threshold_days,
        "amount_mismatch_tolerance": POLICY.amount_mismatch_tolerance,
        "control_catalog": get_control_catalog(),
        "role_assignments": {
            "senior_approver": sorted(POLICY.senior_approvers),
            "approver": sorted(POLICY.senior_approvers),
        },
    }


@app.get("/graph/image", dependencies=[require_role(*READ_ROLES)])
@_rate_limit("20/minute")
def graph_image(request: Request):
    """
    Return a PNG visualization of the financial digital twin graph.
    Nodes are colour-coded by type: employee, vendor, vendor_creation,
    invoice, approval_decision, transaction.
    """
    if state.graph is None:
        raise HTTPException(
            status_code=400,
            detail="Graph not built. Call POST /build-graph first.",
        )

    G = state.graph

    color_map = {
        "vendor": "#4A90D9",
        "employee": "#27AE60",
        "vendor_creation": "#1ABC9C",
        "invoice": "#F39C12",
        "approval_decision": "#E74C3C",
        "transaction": "#9B59B6",
    }
    node_colors = [
        color_map.get(G.nodes[n].get("node_type"), "#95A5A6")
        for n in G.nodes()
    ]

    fig, ax = plt.subplots(figsize=(22, 16))
    pos = nx.spring_layout(G, seed=42, k=1.8)
    nx.draw(
        G, pos, ax=ax,
        node_color=node_colors,
        node_size=280,
        with_labels=False,
        arrows=True,
        arrowsize=8,
        edge_color="#BBBBBB",
        width=0.6,
    )

    legend_elements = [
        mpatches.Patch(facecolor="#27AE60", label="Employee"),
        mpatches.Patch(facecolor="#4A90D9", label="Vendor"),
        mpatches.Patch(facecolor="#1ABC9C", label="Vendor Creation (Decision Node)"),
        mpatches.Patch(facecolor="#F39C12", label="Invoice"),
        mpatches.Patch(facecolor="#E74C3C", label="Approval Decision"),
        mpatches.Patch(facecolor="#9B59B6", label="Transaction"),
    ]
    ax.legend(handles=legend_elements, loc="upper left", fontsize=11, framealpha=0.9)
    ax.set_title(
        "Decision & Financial Digital Twin — Control Pathway Graph\n"
        f"{G.number_of_nodes()} nodes  |  {G.number_of_edges()} edges",
        fontsize=14,
        fontweight="bold",
        pad=16,
    )

    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png")


@app.get("/graph/stats", dependencies=[require_role(*READ_ROLES)])
def get_graph_stats():
    """
    Return a lightweight summary of the digital twin graph (node/edge counts,
    breakdown by node type) for the dashboard stat cards.
    """
    if state.graph is None:
        raise HTTPException(
            status_code=400,
            detail="Graph not built. Call POST /build-graph first.",
        )

    G = state.graph
    node_types = {
        nt: sum(1 for _, d in G.nodes(data=True) if d.get("node_type") == nt)
        for nt in [
            "employee", "vendor", "vendor_creation",
            "invoice", "approval_decision", "transaction",
        ]
    }
    return {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "node_types": node_types,
    }


def _native(value):
    """Convert numpy/pandas scalars to JSON-safe Python types."""
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) else float(value)
    if hasattr(value, "item"):       # numpy scalar (int64, float64, bool_, …)
        result = value.item()
        if isinstance(result, float) and math.isnan(result):
            return None
        return result
    return str(value)


@app.get("/graph/data", dependencies=[require_role(*READ_ROLES)])
def get_graph_topology(request: Request):
    """
    Return the full graph topology as JSON for the interactive React Flow
    visualisation in the frontend.

    Includes:
      - nodes: list of {id, node_type, …attributes}
      - edges: list of {id, source, target, edge_type}
      - risk_node_ids: list of node IDs that appear in confirmed risk pathways
      - stats: {total_nodes, total_edges}
    """
    if state.graph is None:
        raise HTTPException(
            status_code=400,
            detail="Graph not built. Call POST /build-graph first.",
        )

    G = state.graph

    # Serialise nodes — convert all numpy / pandas types to plain Python
    nodes = []
    for node_id, attrs in G.nodes(data=True):
        serialised: dict = {"id": str(node_id)}
        for k, v in attrs.items():
            serialised[k] = _native(v)
        nodes.append(serialised)

    # Serialise edges
    edges = []
    for source, target, attrs in G.edges(data=True):
        edges.append(
            {
                "id": f"{source}__{target}",
                "source": str(source),
                "target": str(target),
                "edge_type": str(attrs.get("edge_type", "")),
            }
        )

    # Collect every node that appears in a confirmed risk finding's graph_path
    seen: set[str] = set()
    risk_node_ids: list[str] = []
    for finding in state.risk_findings or []:
        for nid in finding.get("graph_path") or []:
            s = str(nid)
            if s not in seen:
                risk_node_ids.append(s)
                seen.add(s)

    payload = {
        "nodes": nodes,
        "edges": edges,
        "risk_node_ids": risk_node_ids,
        "stats": {
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
        },
    }
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


# ---------------------------------------------------------------------------
# Case Management Endpoints
# ---------------------------------------------------------------------------

@app.get("/cases", dependencies=[require_role(*READ_ROLES)])
def get_cases(request: Request):
    """List all persisted investigation cases ordered by risk score."""
    from app.cases import list_cases
    cases = list_cases()
    payload = {"cases": cases, "total": len(cases)}
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


@app.get("/cases/{case_id}", dependencies=[require_role(*READ_ROLES)])
def get_single_case(request: Request, case_id: str):
    """Return a single investigation case by ID."""
    from app.cases import get_case
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")
    if _is_auditor(request):
        case = _redact_vendor_data(case)
    return case


class StatusUpdate(BaseModel):
    status: str
    updated_by: str = "user"


class GovernanceUpdate(BaseModel):
    owner: Optional[str] = None
    remediation_action: Optional[str] = None
    remediation_due_at: Optional[str] = None
    resolution_notes: Optional[str] = None
    escalated_to: Optional[str] = None
    updated_by: str = "user"


class Web3AnchorRequest(BaseModel):
    event_type: str = "case.risk.finding"
    ipfs_cid: Optional[str] = None
    commit_on_chain: bool = True
    force_new: bool = False


class Web3BadgeIssueRequest(BaseModel):
    badge_type: str = "Audit Compliance Badge"
    recipient_wallet: Optional[str] = None
    anchor_id: Optional[str] = None
    metadata_uri: Optional[str] = None
    commit_on_chain: bool = True
    force_new: bool = False


@app.patch("/cases/{case_id}/status", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("30/minute")
def update_status(request: Request, case_id: str, body: StatusUpdate):
    """Update the lifecycle status of an investigation case."""
    from app.cases import update_case_status
    try:
        updated = update_case_status(case_id, body.status, by=body.updated_by)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not updated:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")
    user = getattr(request.state, "current_user", {"username": body.updated_by, "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="case.status.update",
        outcome="success",
        resource=f"/cases/{case_id}/status",
        details={"status": body.status},
    )
    return updated


@app.patch("/cases/{case_id}/governance", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("30/minute")
def update_case_governance_endpoint(request: Request, case_id: str, body: GovernanceUpdate):
    """Update remediation and governance metadata for an investigation case."""
    from app.cases import update_case_governance

    updates = {
        key: value
        for key, value in body.model_dump().items()
        if key != "updated_by" and value is not None
    }
    updated = update_case_governance(case_id, updates, by=body.updated_by)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")
    user = getattr(request.state, "current_user", {"username": body.updated_by, "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="case.governance.update",
        outcome="success",
        resource=f"/cases/{case_id}/governance",
        details={"fields": sorted(list(updates.keys()))},
    )
    return updated


# ---------------------------------------------------------------------------
# Web3 Anchoring Endpoints
# ---------------------------------------------------------------------------

@app.post("/web3/anchor/case/{case_id}", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("20/minute")
def anchor_case_on_web3(request: Request, case_id: str, body: Web3AnchorRequest):
    """Create an immutable proof anchor for a case, with optional on-chain submission."""
    from app.cases import get_case
    from app.web3_anchor import anchor_case

    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    event_type = (body.event_type or "").strip()
    if not event_type:
        raise HTTPException(status_code=422, detail="event_type cannot be empty.")

    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    proof = anchor_case(
        case_id=case_id,
        event_type=event_type,
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        ipfs_cid=body.ipfs_cid,
        commit_on_chain=body.commit_on_chain,
        force_new=body.force_new,
    )

    outcome = "success" if proof.get("status") in {"submitted", "simulated", "queued"} else "failure"
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="web3.case.anchor",
        outcome=outcome,
        resource=f"/web3/anchor/case/{case_id}",
        details={
            "anchor_id": proof.get("anchor_id"),
            "status": proof.get("status"),
            "already_exists": bool(proof.get("already_exists")),
            "event_type": event_type,
        },
    )
    return proof


@app.get("/web3/proofs/case/{case_id}", dependencies=[require_role(*READ_ROLES)])
def list_case_web3_proofs(request: Request, case_id: str):
    """List all Web3 proof records associated with a case."""
    from app.web3_anchor import list_case_proofs

    proofs = list_case_proofs(case_id)
    payload = {"case_id": case_id, "proofs": proofs, "total": len(proofs)}
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


@app.get("/web3/proofs/{anchor_id}", dependencies=[require_role(*READ_ROLES)])
def get_web3_proof(request: Request, anchor_id: str):
    """Fetch one proof record by anchor id."""
    from app.web3_anchor import get_proof

    proof = get_proof(anchor_id)
    if not proof:
        raise HTTPException(status_code=404, detail=f"Proof '{anchor_id}' not found.")
    if _is_auditor(request):
        proof = _redact_vendor_data(proof)
    return proof


@app.post("/web3/badges/case/{case_id}", dependencies=[require_role(*OPERATE_ROLES)])
@_rate_limit("20/minute")
def issue_case_badge(request: Request, case_id: str, body: Web3BadgeIssueRequest):
    """Issue an NFT-style compliance badge linked to an existing case proof anchor."""
    from app.cases import get_case
    from app.web3_badges import issue_badge

    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    badge_type = (body.badge_type or "").strip()
    if not badge_type:
        raise HTTPException(status_code=422, detail="badge_type cannot be empty.")

    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    try:
        badge = issue_badge(
            case_id=case_id,
            badge_type=badge_type,
            actor=user.get("username", "unknown"),
            role=user.get("role", "unknown"),
            recipient_wallet=body.recipient_wallet,
            anchor_id=body.anchor_id,
            metadata_uri=body.metadata_uri,
            commit_on_chain=body.commit_on_chain,
            force_new=body.force_new,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    outcome = "success" if badge.get("status") in {"submitted", "simulated", "queued"} else "failure"
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="web3.badge.issue",
        outcome=outcome,
        resource=f"/web3/badges/case/{case_id}",
        details={
            "badge_id": badge.get("badge_id"),
            "token_id": badge.get("token_id"),
            "anchor_id": badge.get("anchor_id"),
            "status": badge.get("status"),
            "already_exists": bool(badge.get("already_exists")),
        },
    )
    return badge


@app.get("/web3/badges/case/{case_id}", dependencies=[require_role(*READ_ROLES)])
def list_case_badges_endpoint(request: Request, case_id: str):
    """List all NFT-style badges issued for a case."""
    from app.web3_badges import list_case_badges

    badges = list_case_badges(case_id)
    payload = {"case_id": case_id, "badges": badges, "total": len(badges)}
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


@app.get("/web3/badges/{badge_id}", dependencies=[require_role(*READ_ROLES)])
def get_case_badge_endpoint(request: Request, badge_id: str):
    """Fetch one badge record by badge id."""
    from app.web3_badges import get_badge

    badge = get_badge(badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail=f"Badge '{badge_id}' not found.")
    if _is_auditor(request):
        badge = _redact_vendor_data(badge)
    return badge


@app.get("/web3/verification/overview", dependencies=[require_role(*READ_ROLES)])
def get_web3_verification_overview(request: Request, limit: int = Query(default=200, ge=1, le=1000)):
    """Unified verification dashboard payload for anchors + NFT badges."""
    from app.web3_anchor import list_all_proofs
    from app.web3_badges import list_all_badges

    proofs = list_all_proofs(limit=limit)
    badges = list_all_badges(limit=limit)

    proof_status = {"submitted": 0, "simulated": 0, "queued": 0, "pending": 0}
    for p in proofs:
        key = str(p.get("status") or "pending").lower()
        proof_status[key] = proof_status.get(key, 0) + 1

    badge_status = {"submitted": 0, "simulated": 0, "queued": 0, "pending": 0}
    for b in badges:
        key = str(b.get("status") or "pending").lower()
        badge_status[key] = badge_status.get(key, 0) + 1

    summary = {
        "proof_total": len(proofs),
        "badge_total": len(badges),
        "proof_status": proof_status,
        "badge_status": badge_status,
        "unique_cases_with_proofs": len({str(p.get("case_id")) for p in proofs if p.get("case_id")}),
        "unique_cases_with_badges": len({str(b.get("case_id")) for b in badges if b.get("case_id")}),
        "last_anchor_at": proofs[0].get("created_at") if proofs else None,
        "last_badge_at": badges[0].get("created_at") if badges else None,
    }

    payload = {
        "summary": summary,
        "recent_proofs": proofs,
        "recent_badges": badges,
    }
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


# ---------------------------------------------------------------------------
# Explainability Endpoints
# ---------------------------------------------------------------------------

@app.get("/cases/{case_id}/explain", dependencies=[require_role(*READ_ROLES)])
def explain_case_endpoint(request: Request, case_id: str):
    """
    Return a full explainability report for a flagged case:
    actors involved, rule description, policy context, counterfactual analysis,
    and traceability chain through the graph.
    """
    from app.explainability import explain_case
    result = explain_case(case_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")
    if _is_auditor(request):
        result = _redact_vendor_data(result)
    return result


@app.get("/explain/transaction/{transaction_id}", dependencies=[require_role(*READ_ROLES)])
def explain_transaction_endpoint(request: Request, transaction_id: str):
    """
    Explain why a specific transaction was NOT flagged by any detection rule.
    Returns per-rule status checks and policy threshold context.
    """
    from app.explainability import explain_transaction_not_flagged
    result = explain_transaction_not_flagged(transaction_id)
    if _is_auditor(request):
        result = _redact_vendor_data(result)
    return result


# ---------------------------------------------------------------------------
# Case AI Chat
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    question: str


@app.post("/cases/{case_id}/chat", tags=["cases"], dependencies=[require_role(*READ_ROLES)])
@_rate_limit("24/minute")
def chat_with_case(request: Request, case_id: str, body: ChatRequest):
    """
    Ask the AI Investigation Assistant a free-form question about a specific case.
    Uses the same Groq/OpenAI-compatible LLM backend as the audit narrative.

    Returns: { case_id, question, answer }
    """
    import os
    import json as _json
    from app.cases import get_case
    from openai import OpenAI

    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    if _is_auditor(request):
        case = _redact_vendor_data(case)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {
            "case_id": case_id,
            "question": body.question,
            "answer": (
                "AI assistant unavailable — GROQ_API_KEY is not configured. "
                "Set the environment variable and restart the server."
            ),
        }

    # Build a compact case summary for the LLM context window
    evidence_text = "\n".join(f"  • {e}" for e in (case.get("evidence") or []))
    context = (
        f"CASE ID: {case_id}\n"
        f"Risk type: {case.get('risk_type')}\n"
        f"Severity: {case.get('risk_label')} (score {case.get('risk_score')})\n"
        f"Vendor: {case.get('vendor')}\n"
        f"Status: {case.get('status')}\n"
        f"Policy violation: {case.get('policy_violation')}\n"
        f"Effect: {case.get('effect')}\n"
        f"Recommendation: {case.get('recommendation')}\n"
        f"Evidence:\n{evidence_text}\n"
    )

    system_prompt = (
        "You are an expert financial forensic auditor specialising in enterprise fraud and control bypass detection. "
        "Answer concisely based only on the case context provided. "
        "If the question cannot be answered from the context, say so clearly. "
        "Never invent data."
    )
    user_prompt = f"Case context:\n{context}\n\nQuestion: {body.question}"

    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    try:
        resp = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=400,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as exc:
        answer = f"AI assistant error — {exc}"

    payload = {"case_id": case_id, "question": body.question, "answer": answer}
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


# ---------------------------------------------------------------------------
# Evidence Bundle Download
# ---------------------------------------------------------------------------

@app.get("/cases/{case_id}/evidence", dependencies=[require_role(*READ_ROLES)])
@_rate_limit("20/minute")
def download_evidence(request: Request, case_id: str):
    """
    Download a ZIP bundle containing the full evidence package for a case:
    case summary JSON, evidence text, graph path, policy context at time of finding.
    """
    from app.cases import get_case
    import app.policy as _pol

    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    if _is_auditor(request):
        case = _redact_vendor_data(case)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Full case JSON
        zf.writestr(f"{case_id}/case_summary.json", json.dumps(case, indent=2, default=str))

        # Evidence as plain text
        evidence_lines = "\n".join(f"  • {e}" for e in (case.get("evidence") or []))
        zf.writestr(
            f"{case_id}/evidence.txt",
            f"CASE: {case_id}\nRISK TYPE: {case['risk_type']}\nVENDOR: {case.get('vendor', 'N/A')}\n\n"
            f"EVIDENCE:\n{evidence_lines}\n\n"
            f"POLICY VIOLATION:\n  {case.get('policy_violation', 'N/A')}\n\n"
            f"EFFECT:\n  {case.get('effect', 'N/A')}\n\n"
            f"RECOMMENDATION:\n  {case.get('recommendation', 'N/A')}\n",
        )

        # Graph traversal path
        graph_path = case.get("graph_path") or []
        zf.writestr(
            f"{case_id}/graph_path.txt",
            "DETECTION PATHWAY (graph traversal):\n" + " → ".join(str(n) for n in graph_path),
        )

        # Policy snapshot
        p = _pol.POLICY
        policy_snapshot = {
            "invoice_approval_threshold": p.invoice_approval_threshold,
            "large_payment_threshold": p.large_payment_threshold,
            "senior_approvers": sorted(p.senior_approvers),
            "invoice_splitting_window_days": p.invoice_splitting_window_days,
            "rapid_payment_max_days": p.rapid_payment_max_days,
            "dormancy_threshold_days": p.dormancy_threshold_days,
        }
        zf.writestr(f"{case_id}/policy_context.json", json.dumps(policy_snapshot, indent=2))

        # Timeline
        timeline = case.get("timeline") or []
        timeline_text = "\n".join(
            f"  [{e.get('at', '')}] {e.get('event', '')} (by: {e.get('by', 'system')})"
            for e in timeline
        )
        zf.writestr(f"{case_id}/timeline.txt", f"CASE TIMELINE:\n{timeline_text}\n")

    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{case_id}_evidence.zip"'},
    )


# ---------------------------------------------------------------------------
# Policy Update (live, no restart needed)
# ---------------------------------------------------------------------------

class PolicyUpdate(BaseModel):
    invoice_approval_threshold: Optional[float] = None
    large_payment_threshold: Optional[float] = None
    senior_approvers: Optional[list[str]] = None
    invoice_splitting_window_days: Optional[int] = None
    invoice_splitting_min_count: Optional[int] = None
    rapid_payment_max_days: Optional[int] = None
    dormancy_threshold_days: Optional[int] = None
    amount_mismatch_tolerance: Optional[float] = None


@app.put("/policy", dependencies=[require_role(*OPERATE_ROLES)])
def update_policy_endpoint(request: Request, body: PolicyUpdate):
    """
    Live-update policy thresholds without restarting the server.
    Changes are persisted to data/policy.json immediately.
    Only provide fields you want to change — omitted fields keep their current values.
    """
    from app.policy import update_policy, POLICY, _POLICY_PATH
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields provided to update.")
    updated = update_policy(updates)
    user = getattr(request.state, "current_user", {"username": "unknown", "role": "unknown"})
    record_audit_event(
        actor=user.get("username", "unknown"),
        role=user.get("role", "unknown"),
        action="policy.update",
        outcome="success",
        resource="/policy",
        details={"fields": sorted(list(updates.keys()))},
    )
    return {
        "message": "Policy updated successfully. Changes are live immediately.",
        "updated_fields": list(updates.keys()),
        "policy": {
            "source": _POLICY_PATH,
            "invoice_approval_threshold": updated.invoice_approval_threshold,
            "large_payment_threshold": updated.large_payment_threshold,
            "senior_approvers": sorted(updated.senior_approvers),
            "invoice_splitting_window_days": updated.invoice_splitting_window_days,
            "invoice_splitting_min_count": updated.invoice_splitting_min_count,
            "rapid_payment_max_days": updated.rapid_payment_max_days,
            "dormancy_threshold_days": updated.dormancy_threshold_days,
            "amount_mismatch_tolerance": updated.amount_mismatch_tolerance,
        },
    }


# ---------------------------------------------------------------------------
# Vendor Search & Subgraph
# ---------------------------------------------------------------------------

@app.get("/graph/search", dependencies=[require_role(*READ_ROLES)])
def search_vendors(request: Request, q: str = Query(default="", description="Name or ID fragment to search")):
    """
    Search vendor nodes in the digital twin graph by name or vendor ID.
    Returns matching vendors with their metadata.
    """
    if state.graph is None:
        raise HTTPException(status_code=400, detail="Graph not built. Call POST /build-graph first.")

    G = state.graph
    q_lower = q.lower()
    vendors = []
    for node_id, attrs in G.nodes(data=True):
        if attrs.get("node_type") != "vendor":
            continue
        name = attrs.get("name", "")
        if not q_lower or q_lower in name.lower() or q_lower in str(node_id).lower():
            # Count invoices and transactions for this vendor
            invoices = [v for _, v, d in G.out_edges(node_id, data=True) if d.get("edge_type") == "issued"]
            transactions = []
            for inv in invoices:
                transactions.extend(v for _, v, d in G.out_edges(inv, data=True) if d.get("edge_type") == "paid_by")
            # Check if vendor has any risk findings
            has_risk = any(
                f.get("vendor_id") == node_id for f in (state.risk_findings or [])
            )
            vendors.append({
                "id": str(node_id),
                "name": name,
                "created_date": attrs.get("created_date"),
                "created_by": attrs.get("created_by"),
                "invoice_count": len(invoices),
                "transaction_count": len(transactions),
                "has_risk": has_risk,
            })

    vendors.sort(key=lambda v: (not v["has_risk"], v["name"]))
    payload = {"vendors": vendors, "count": len(vendors), "query": q}
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


@app.get("/graph/vendor/{vendor_id}", dependencies=[require_role(*READ_ROLES)])
def get_vendor_subgraph(request: Request, vendor_id: str):
    """
    Extract and return the subgraph centred on a specific vendor.
    Includes: vendor creation node, creating employee, all invoices, approval decisions,
    approving employees, and payment transactions. Also surfaces any risk findings for this vendor.
    """
    if state.graph is None:
        raise HTTPException(status_code=400, detail="Graph not built. Call POST /build-graph first.")

    G = state.graph
    if vendor_id not in G.nodes:
        raise HTTPException(status_code=404, detail=f"Vendor '{vendor_id}' not found in graph.")

    sub_ids: set[str] = {vendor_id}

    # Vendor creation node and creating employee
    for u, _, d in G.in_edges(vendor_id, data=True):
        if d.get("edge_type") == "onboarded":
            sub_ids.add(u)
            for u2, _, d2 in G.in_edges(u, data=True):
                if d2.get("edge_type") == "performed":
                    sub_ids.add(u2)

    # Invoices → approval decisions → approver employees, and → transactions
    for _, v, d in G.out_edges(vendor_id, data=True):
        if d.get("edge_type") == "issued":
            sub_ids.add(v)
            for _, ad, d2 in G.out_edges(v, data=True):
                if d2.get("edge_type") == "has_approval":
                    sub_ids.add(ad)
                    for _, emp, d3 in G.out_edges(ad, data=True):
                        if d3.get("edge_type") == "approved_by":
                            sub_ids.add(emp)
            for _, txn, d2 in G.out_edges(v, data=True):
                if d2.get("edge_type") == "paid_by":
                    sub_ids.add(txn)

    subgraph = G.subgraph(sub_ids)
    nodes_out = [
        {"id": str(nid), **{k: _native(v) for k, v in attrs.items()}}
        for nid, attrs in subgraph.nodes(data=True)
    ]
    edges_out = [
        {"id": f"{s}__{t}", "source": str(s), "target": str(t), "edge_type": str(d.get("edge_type", ""))}
        for s, t, d in subgraph.edges(data=True)
    ]

    # Risk findings for this vendor
    vendor_findings = [f for f in (state.risk_findings or []) if f.get("vendor_id") == vendor_id]
    risk_node_ids = list({str(n) for f in vendor_findings for n in f.get("graph_path", [])})

    payload = {
        "vendor_id": vendor_id,
        "vendor_name": G.nodes[vendor_id].get("name"),
        "nodes": nodes_out,
        "edges": edges_out,
        "risk_node_ids": risk_node_ids,
        "risk_findings": vendor_findings,
        "stats": {"nodes": len(nodes_out), "edges": len(edges_out)},
    }
    if _is_auditor(request):
        payload = _redact_vendor_data(payload)
    return payload


# ---------------------------------------------------------------------------
# Compliance Report
# ---------------------------------------------------------------------------

@app.get("/compliance", dependencies=[require_role(*READ_ROLES)])
def get_compliance_report():
    """
    Compute a compliance score and per-control-category breakdown from current findings.
    Score = percentage of transactions not involved in any flagged risk pathway.
    """
    if not state.risk_findings:
        raise HTTPException(
            status_code=400,
            detail="No findings available. Run the audit pipeline first.",
        )

    from app.policy import POLICY, get_control_catalog

    total_txns = len(state.transactions) if state.transactions is not None else 0

    risk_type_counts: dict[str, int] = {}
    for f in state.risk_findings:
        rt = f.get("risk_type", "unknown")
        risk_type_counts[rt] = risk_type_counts.get(rt, 0) + 1

    transaction_ids = set()
    if state.transactions is not None and "transaction_id" in state.transactions.columns:
        transaction_ids = set(state.transactions["transaction_id"].astype(str).tolist())

    flagged_txns: set[str] = set()
    for f in state.risk_findings:
        for node in f.get("graph_path") or []:
            s = str(node)
            if s in transaction_ids or s.startswith("T"):
                flagged_txns.add(s)

    clean_pct = round(((total_txns - len(flagged_txns)) / max(total_txns, 1)) * 100, 1)

    def _cat(name: str, control: str, risk_type: str, control_id: str) -> dict:
        v = risk_type_counts.get(risk_type, 0)
        return {
            "name": name,
            "control": control,
            "control_id": control_id,
            "violations": v,
            "status": "PASS" if v == 0 else "FAIL",
        }

    categories = [
        _cat("Separation of Duties", "Vendor creator must not approve their own invoices", "segregation_of_duties", "CTRL-SOD-001"),
        _cat("Invoice Splitting Control", f"Multiple invoices below threshold within {POLICY.invoice_splitting_window_days} days", "invoice_splitting", "CTRL-THR-002"),
        _cat("Rapid Payment Controls", f"Payment must not occur within {POLICY.rapid_payment_max_days} day(s) of vendor onboarding", "rapid_vendor_to_payment", "CTRL-CYC-003"),
        _cat("Senior Approver Requirement", f"Transactions above ₹{POLICY.large_payment_threshold:,.0f} require a senior approver", "large_payment_no_senior_approver", "CTRL-APP-004"),
        _cat("Approval Presence Check", "Every paid invoice must have an approval decision", "missing_approval", "CTRL-APP-005"),
        _cat("Duplicate Invoice Detection", "Duplicate invoice submissions must be blocked", "duplicate_invoice", "CTRL-DUP-006"),
        _cat("Amount Mismatch Detection", f"Invoice and transaction amounts must match within ±₹{POLICY.amount_mismatch_tolerance:,.0f}", "amount_mismatch", "CTRL-PAY-007"),
        _cat("Dormant Vendor Activity", f"Vendor inactive for >{POLICY.dormancy_threshold_days} days flagged on reactivation", "dormant_vendor_reactivation", "CTRL-VEN-008"),
    ]

    passed = sum(1 for c in categories if c["status"] == "PASS")

    risk_distribution = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}

    # Prefer case labels (normalized and persisted by case management).
    try:
        from app.cases import list_cases

        for c in list_cases():
            k = str(c.get("risk_label", "")).strip().upper()
            if k in risk_distribution:
                risk_distribution[k] += 1
    except Exception:
        # Fallback for environments that only have raw findings loaded.
        for f in state.risk_findings:
            k = str(f.get("risk_label", "")).strip().upper()
            if k in risk_distribution:
                risk_distribution[k] += 1

    return {
        "compliance_score": clean_pct,
        "controls_passed": passed,
        "controls_total": len(categories),
        "total_transactions": total_txns,
        "flagged_transactions": len(flagged_txns),
        "total_findings": len(state.risk_findings),
        "categories": categories,
        "control_catalog": get_control_catalog(),
        "risk_distribution": risk_distribution,
        "audit_session": state.audit_session,
    }


@app.get("/systemic-insights", dependencies=[require_role(*READ_ROLES)])
def get_systemic_insights(request: Request):
    """Return cross-case governance hotspots, recurring actors, and control concentration."""
    if not state.risk_findings:
        raise HTTPException(
            status_code=400,
            detail="No findings available. Run the audit pipeline first.",
        )

    from app.cases import list_cases
    from app.insights import build_systemic_insights

    insights = build_systemic_insights()
    if _is_auditor(request):
        vendor_counts: Counter[str] = Counter()
        for case in list_cases():
            vendor_counts[str(case.get("vendor_id") or "UNKNOWN_VENDOR")] += 1
        insights["recurring_vendors"] = [
            {"vendor": vendor_id, "count": count}
            for vendor_id, count in vendor_counts.most_common(5)
        ]
        insights = _redact_vendor_data(insights)
    return insights
