import json
import os
from dataclasses import asdict, dataclass, fields

_POLICY_PATH = "data/policy.json"


@dataclass
class PolicyConfig:
    # Invoices at or above this amount require managerial approval
    invoice_approval_threshold: float = 12_600_000.0  # ₹1.26 Cr (was $150,000)

    # Invoices above this amount require a designated senior approver
    large_payment_threshold: float = 42_000_000.0  # ₹4.2 Cr (was $500,000)

    # User IDs designated as senior approvers
    senior_approvers: frozenset = frozenset({"user_88", "user_99"})

    # Maximum days between invoices to classify as a splitting cluster
    invoice_splitting_window_days: int = 3

    # Minimum number of sub-threshold invoices to flag as splitting
    invoice_splitting_min_count: int = 2

    # Maximum days from vendor creation to first payment to flag as rapid cycle
    rapid_payment_max_days: int = 7

    # Minimum days of inactivity before a vendor is considered dormant
    dormancy_threshold_days: int = 180

    # Tolerance for invoice vs transaction amount comparison (0 = exact match required)
    amount_mismatch_tolerance: float = 0.0


@dataclass(frozen=True)
class ControlDefinition:
    control_id: str
    name: str
    governance_area: str
    objective: str
    severity: str
    linked_risk_types: tuple[str, ...]


CONTROL_CATALOG: tuple[ControlDefinition, ...] = (
    ControlDefinition(
        control_id="CTRL-SOD-001",
        name="Separation of Duties",
        governance_area="Access Governance",
        objective="Ensure the employee onboarding a vendor cannot approve invoices for that vendor.",
        severity="critical",
        linked_risk_types=("segregation_of_duties",),
    ),
    ControlDefinition(
        control_id="CTRL-THR-002",
        name="Invoice Threshold Enforcement",
        governance_area="Approval Governance",
        objective="Prevent invoice splitting from bypassing approval thresholds.",
        severity="high",
        linked_risk_types=("invoice_splitting",),
    ),
    ControlDefinition(
        control_id="CTRL-CYC-003",
        name="Rapid Vendor-to-Payment Review",
        governance_area="Vendor Governance",
        objective="Ensure newly created vendors cannot be paid before a minimum vetting period.",
        severity="high",
        linked_risk_types=("rapid_vendor_to_payment",),
    ),
    ControlDefinition(
        control_id="CTRL-APP-004",
        name="Senior Approver Requirement",
        governance_area="Approval Governance",
        objective="Require senior approvers for high-value transactions.",
        severity="high",
        linked_risk_types=("large_payment_no_senior_approver",),
    ),
    ControlDefinition(
        control_id="CTRL-APP-005",
        name="Approval Presence Check",
        governance_area="Approval Governance",
        objective="Ensure every paid invoice has an explicit approval decision.",
        severity="critical",
        linked_risk_types=("missing_approval",),
    ),
    ControlDefinition(
        control_id="CTRL-DUP-006",
        name="Duplicate Invoice Screening",
        governance_area="Invoice Governance",
        objective="Prevent duplicate invoices of identical amount and timing from being processed.",
        severity="medium",
        linked_risk_types=("duplicate_invoice",),
    ),
    ControlDefinition(
        control_id="CTRL-PAY-007",
        name="Invoice-Transaction Amount Match",
        governance_area="Payment Integrity",
        objective="Ensure approved invoice values match executed payment amounts.",
        severity="medium",
        linked_risk_types=("amount_mismatch",),
    ),
    ControlDefinition(
        control_id="CTRL-VEN-008",
        name="Dormant Vendor Reactivation Review",
        governance_area="Vendor Governance",
        objective="Require legitimacy review before paying long-dormant vendors.",
        severity="low",
        linked_risk_types=("dormant_vendor_reactivation",),
    ),
)

_DEFAULT_CONTROL_CATALOG = CONTROL_CATALOG


def get_control_catalog() -> list[dict]:
    return [asdict(control) for control in CONTROL_CATALOG]


def get_control_metadata() -> dict[str, dict]:
    metadata: dict[str, dict] = {}
    for control in CONTROL_CATALOG:
        for risk_type in control.linked_risk_types:
            metadata[risk_type] = {
                "control_ids": [control.control_id],
                "governance_area": control.governance_area,
                "root_cause": control.objective,
            }
    return metadata


def _load() -> tuple["PolicyConfig", tuple["ControlDefinition", ...]]:
    """Load policy settings and control catalog from data/policy.json if present, else use defaults."""
    if os.path.exists(_POLICY_PATH):
        with open(_POLICY_PATH) as fh:
            data = json.load(fh)
        controls_raw = data.pop("controls", None)
        if "senior_approvers" in data:
            data["senior_approvers"] = frozenset(data["senior_approvers"])
        policy = PolicyConfig(**data)

        if controls_raw:
            catalog = tuple(
                ControlDefinition(
                    control_id=c["control_id"],
                    name=c["name"],
                    governance_area=c["governance_area"],
                    objective=c["objective"],
                    severity=c["severity"],
                    linked_risk_types=tuple(c["linked_risk_types"]),
                )
                for c in controls_raw
            )
        else:
            catalog = _DEFAULT_CONTROL_CATALOG

        return policy, catalog
    return PolicyConfig(), _DEFAULT_CONTROL_CATALOG


POLICY, CONTROL_CATALOG = _load()


def update_policy(data: dict) -> PolicyConfig:
    """Apply partial updates to POLICY in place and persist to policy.json."""
    global POLICY
    field_names = {f.name for f in fields(POLICY)}
    for key, value in data.items():
        if key not in field_names:
            continue
        if key == "senior_approvers":
            setattr(POLICY, key, frozenset(value))
        else:
            setattr(POLICY, key, type(getattr(POLICY, key))(value))

    # Persist to disk — include both threshold values and the control catalog
    controls_payload = [
        {
            "control_id": c.control_id,
            "name": c.name,
            "governance_area": c.governance_area,
            "objective": c.objective,
            "severity": c.severity,
            "linked_risk_types": list(c.linked_risk_types),
        }
        for c in CONTROL_CATALOG
    ]
    payload = {
        "invoice_approval_threshold": POLICY.invoice_approval_threshold,
        "large_payment_threshold": POLICY.large_payment_threshold,
        "senior_approvers": sorted(POLICY.senior_approvers),
        "invoice_splitting_window_days": POLICY.invoice_splitting_window_days,
        "invoice_splitting_min_count": POLICY.invoice_splitting_min_count,
        "rapid_payment_max_days": POLICY.rapid_payment_max_days,
        "dormancy_threshold_days": POLICY.dormancy_threshold_days,
        "amount_mismatch_tolerance": POLICY.amount_mismatch_tolerance,
        "controls": controls_payload,
    }
    with open(_POLICY_PATH, "w") as fh:
        json.dump(payload, fh, indent=2)
    return POLICY
