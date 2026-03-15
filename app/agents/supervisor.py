"""
Multi-agent audit orchestration using LangGraph.

Architecture
------------
START → supervisor → data_agent → supervisor → investigation_agent → supervisor → END

Supervisor:  An LLM node that reads the message history and routes to the
             correct agent or decides the pipeline is complete (FINISH).

Agent 1 — data_agent
    Responsible for Steps 1-3 of the audit pipeline:
    • load_and_clean_data    — ingest & clean the 4 CSV datasets
    • build_financial_graph  — construct the digital twin graph
    • detect_fraud_risks     — run all 8 graph-traversal detection rules

Agent 2 — investigation_agent
    Responsible for Steps 4-6 of the audit pipeline:
    • test_all_transactions  — run 5 per-transaction control tests
    • generate_audit_report  — call LLM, produce executive narrative

Both agents are ReAct agents that call their tools autonomously and report
results back to the supervisor as plain-text messages.
"""

from __future__ import annotations

import os
from typing import Annotated, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import create_react_agent
from typing_extensions import TypedDict

from app.agents.tools import (
    build_financial_graph,
    detect_fraud_risks,
    generate_audit_report,
    load_and_clean_data,
    test_all_transactions,
)

# ---------------------------------------------------------------------------
# Shared pipeline state — passed between every node in the graph
# ---------------------------------------------------------------------------

AGENTS = ["data_agent", "investigation_agent"]


class AuditState(TypedDict):
    messages: Annotated[list, add_messages]
    next: str   # which agent the supervisor chose, or "FINISH"


# ---------------------------------------------------------------------------
# LLM factory
# ---------------------------------------------------------------------------

def _make_llm() -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")
    return ChatGroq(model="llama-3.1-8b-instant", temperature=0, api_key=api_key)


# ---------------------------------------------------------------------------
# Supervisor node
# ---------------------------------------------------------------------------

_SUPERVISOR_PROMPT = """You are an audit pipeline supervisor.
Decide which worker should act next, or whether the pipeline is done.

Workers:
- data_agent         → loads data, builds graph, detects fraud risks (Steps 1-3)
- investigation_agent → tests transactions, generates the final report (Steps 4-6)

Rules (follow in order):
1. If no work has been done yet, respond: data_agent
2. If data_agent has completed all three of its steps (data loaded, graph built,
   risks detected), respond: investigation_agent
3. If investigation_agent has completed both of its steps (transactions tested,
   report generated), respond: FINISH
4. On error from a worker, route back to the same worker once; after a second
   consecutive failure from the same worker, respond: FINISH

Reply with EXACTLY one word — no punctuation, no explanation:
data_agent | investigation_agent | FINISH
"""


def supervisor_node(state: AuditState) -> AuditState:
    llm = _make_llm()
    messages = [SystemMessage(content=_SUPERVISOR_PROMPT)] + state["messages"]
    response = llm.invoke(messages)
    decision = response.content.strip().split()[0]   # take first word only

    if decision not in AGENTS + ["FINISH"]:
        decision = "data_agent"

    return {"messages": [], "next": decision}


# ---------------------------------------------------------------------------
# Routing function — reads `next` field and maps to a graph edge
# ---------------------------------------------------------------------------

def _route(state: AuditState) -> Literal["data_agent", "investigation_agent", "__end__"]:
    nxt = state.get("next", "data_agent")
    return END if nxt == "FINISH" else nxt


# ---------------------------------------------------------------------------
# Agent node wrapper
# Runs the ReAct agent, then appends its reply as a named HumanMessage so
# the supervisor can see who reported and what they said.
# ---------------------------------------------------------------------------

def _make_agent_node(name: str, agent):
    def node(state: AuditState) -> AuditState:
        result = agent.invoke({"messages": state["messages"]})
        last = result["messages"][-1]
        labelled = HumanMessage(
            content=f"[{name}]: {last.content}",
            name=name,
        )
        return {"messages": [labelled]}
    node.__name__ = name
    return node


# ---------------------------------------------------------------------------
# Graph construction (built once, cached)
# ---------------------------------------------------------------------------

_compiled_graph = None


def get_audit_graph():
    global _compiled_graph
    if _compiled_graph is not None:
        return _compiled_graph

    llm = _make_llm()

    # --- Agent 1: Data & Detection ---
    data_agent = create_react_agent(
        llm,
        tools=[load_and_clean_data, build_financial_graph, detect_fraud_risks],
        prompt=(
            "You are the Data & Detection Agent (Agent 1) in a financial audit pipeline.\n"
            "Your job — call these three tools in order:\n"
            "  1. load_and_clean_data\n"
            "  2. build_financial_graph\n"
            "  3. detect_fraud_risks\n"
            "After all three succeed, summarise the findings and stop."
        ),
    )

    # --- Agent 2: Investigation & Reporting ---
    investigation_agent = create_react_agent(
        llm,
        tools=[test_all_transactions, generate_audit_report],
        prompt=(
            "You are the Investigation & Reporting Agent (Agent 2) in a financial audit pipeline.\n"
            "Agent 1 has already built the graph and detected risks.\n"
            "Your job — call these two tools in order:\n"
            "  1. test_all_transactions\n"
            "  2. generate_audit_report\n"
            "After both succeed, summarise the report and stop."
        ),
    )

    data_node = _make_agent_node("data_agent", data_agent)
    investigation_node = _make_agent_node("investigation_agent", investigation_agent)

    graph = StateGraph(AuditState)
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("data_agent", data_node)
    graph.add_node("investigation_agent", investigation_node)

    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges("supervisor", _route)
    graph.add_edge("data_agent", "supervisor")
    graph.add_edge("investigation_agent", "supervisor")

    _compiled_graph = graph.compile()
    return _compiled_graph


# ---------------------------------------------------------------------------
# Public entry point called by /run-audit
# ---------------------------------------------------------------------------

def run_audit_pipeline(prompt: str = "Run the full financial audit pipeline.") -> dict:
    """
    Reset app state and invoke the two-agent audit pipeline end-to-end.
    Returns a structured result with the investigation report and conversation log.
    """
    from app.state import state as app_state

    # Reset all derived state before a fresh run
    app_state.graph = None
    app_state.risk_findings = []
    app_state.audit_session = None
    app_state.investigation_report = None
    app_state.cleaning_report = None

    audit_graph = get_audit_graph()

    initial: AuditState = {
        "messages": [HumanMessage(content=prompt)],
        "next": "data_agent",
    }

    final = audit_graph.invoke(initial, {"recursion_limit": 40})

    # Build a clean conversation log from the message history
    conversation = []
    for msg in final["messages"]:
        role = getattr(msg, "name", None) or msg.__class__.__name__
        conversation.append({"role": role, "content": msg.content})

    return {
        "status": "completed",
        "total_messages": len(final["messages"]),
        "risk_findings_count": len(app_state.risk_findings),
        "investigation_report": app_state.investigation_report,
        "cleaning_report": app_state.cleaning_report,
        "conversation": conversation,
    }
