# FinSentry 🛡️

**AI-Powered Financial Compliance & Fraud Detection Platform**

FinSentry is an advanced financial audit and compliance system that leverages artificial intelligence, machine learning, and intelligent agents to detect anomalies, identify fraud patterns, and ensure regulatory compliance in real-time. Built with a modern tech stack featuring FastAPI backend, React TypeScript frontend, and blockchain integration.

---

## 🌟 Key Features

- **AI-Powered Audit Agents** — Autonomous agents using LangGraph and LangChain to investigate financial anomalies
- **Real-Time Risk Detection** — ML-based fraud detection and anomaly identification across financial transactions
- **Explainability & Insights** — Generate detailed audit reports with visual explanations and risk assessments
- **Network Analysis** — Graph-based analysis of financial relationships and transaction flows
- **Blockchain Integration** — Smart contract support for audit trails and badge registry on Web3
- **Multi-Tier Authentication** — Secure OAuth2 with JWT tokens and role-based access control
- **Audit Logging** — Complete audit trail of all system activities
- **Rate Limiting** — Built-in protection against abuse
- **Professional Dashboard** — Intuitive React UI for case management and risk intelligence
- **Comprehensive Testing** — pytest-based test suite with smoke and hardening tests

---

## 📋 Tech Stack

### Backend
- **Framework:** FastAPI, Uvicorn
- **AI/ML:** OpenAI, Groq, LangChain, LangGraph
- **Data:** Pandas, NetworkX (graph analysis)
- **Security:** python-jose, JWT authentication
- **Blockchain:** Web3.py
- **Rate Limiting:** slowapi
- **Validation:** Pydantic

### Frontend
- **Framework:** React 18+, TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Testing:** Vitest, Playwright

### Infrastructure
- **Smart Contracts:** Solidity (Hardhat)
- **Task Runner:** npm/bun
- **Version Control:** Git

---

## 📁 Project Structure

```
FinSentry/
├── app/                           # Python backend application
│   ├── agents/                    # AI agent implementations (supervisor, tools)
│   ├── auth.py                    # Authentication & authorization
│   ├── audit_log.py               # Audit trail logging
│   ├── cases.py                   # Case management
│   ├── investigator.py            # Report generation
│   ├── risk.py                    # Risk detection algorithms
│   ├── graph.py                   # Network graph analysis
│   ├── insights.py                # Insight generation
│   ├── models.py                  # Data models
│   ├── main.py                    # FastAPI application entry point
│   ├── state.py                   # Global application state
│   └── web3_*.py                  # Blockchain integration modules
├── frontend/                      # React TypeScript frontend
│   └── fintwin-command-main/      # Main frontend application
│       ├── src/
│       │   ├── components/        # Reusable UI components
│       │   ├── pages/             # Page components
│       │   ├── lib/               # Utilities and API calls
│       │   └── App.tsx            # Main App component
│       ├── vite.config.ts
│       └── tailwind.config.ts
├── web3/                          # Smart contracts & blockchain
│   ├── contracts/                 # Solidity contracts
│   │   ├── AuditBadgeRegistry.sol
│   │   └── AuditEventRegistry.sol
│   ├── scripts/                   # Deployment scripts
│   └── hardhat.config.js
├── tests/                         # Test suite
│   ├── test_smoke.py              # Smoke tests
│   └── test_authz_hardening.py    # Security tests
├── data/                          # Sample datasets
│   ├── transactions.csv
│   ├── employees.csv
│   ├── vendors.csv
│   ├── invoices.csv
│   ├── approvals.csv
│   └── policy.json
├── releases/                      # Version release notes
├── scripts/                       # Utility scripts
├── requirements.txt               # Python dependencies
├── pytest.ini                     # Pytest configuration
└── README.md                      # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm (or bun)
- **Git**

### 1️⃣ Clone & Backend Setup

**Windows PowerShell:**
```powershell
git clone https://github.com/ullasdewangan09/Fin_Sentry.git
cd Fin_Sentry
python -m venv .venv_local
.\.venv_local\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

**macOS / Linux:**
```bash
git clone https://github.com/ullasdewangan09/Fin_Sentry.git
cd Fin_Sentry
python3 -m venv .venv_local
source .venv_local/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

### 2️⃣ Configure Environment Variables

Update `.env` with these critical values:

```bash
# Generate a strong JWT_SECRET_KEY:
# Windows: $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_}); Write-Host "JWT_SECRET_KEY=$secret"
# macOS/Linux: openssl rand -base64 32

JWT_SECRET_KEY=<your-generated-secret>

# Optional: Add Groq API key (get from https://console.groq.com)
GROQ_API_KEY=<your-groq-api-key>

# Optional: Add OpenAI API key for advanced features
OPENAI_API_KEY=<your-openai-api-key>
```

### 3️⃣ Frontend Setup

```bash
cd frontend/fintwin-command-main
npm install
cd ../..
```

### 4️⃣ Run the Application

**Terminal 1 — Backend API:**
```powershell
cd Fin_Sentry
.\.venv_local\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend/fintwin-command-main
npm run dev
```

Access the application at `http://localhost:5173` (frontend) and API at `http://localhost:8000/docs` (Swagger UI).

---

## 🔗 Optional: Blockchain Setup

To enable Web3 capabilities and smart contracts:

**Windows PowerShell:**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_web3_local.ps1
```

**macOS / Linux:**
```bash
cd web3
npm install
npm run node        # Terminal 1
npm run deploy:local # Terminal 2
```

---

## 📖 API Documentation

Once the backend is running, access the interactive API documentation:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Key Endpoints

- `POST /login` — User authentication
- `GET /dashboard` — Compliance dashboard
- `GET /risk-intelligence` — Risk detection results
- `POST /audit` — Trigger audit pipeline
- `GET /cases` — Case management
- `GET /transactions` — View transactions with risk scores

---

## 🧪 Testing

Run the test suite:

```bash
# Activate virtual environment first
.\.venv_local\Scripts\Activate.ps1  # Windows
source .venv_local/bin/activate     # macOS/Linux

# Run all tests
pytest

# Run specific test file
pytest tests/test_smoke.py

# Run with coverage
pytest --cov=app tests/
```

---

## 🛠️ Development Workflow

### Backend Development
1. Activate virtual environment
2. Make code changes
3. Run `python -m uvicorn app.main:app --reload`
4. Write tests in `tests/` directory
5. Run `pytest` to validate

### Frontend Development
1. Navigate to `frontend/fintwin-command-main`
2. Run `npm run dev`
3. Edit components in `src/components/`
4. Changes auto-refresh via Vite HMR

---

## 📊 Key Modules

### `app.agents`
- **supervisor.py** — Orchestrates AI agents for audit pipeline
- **tools.py** — Tool definitions for agent use

### `app.risk`
- Risk detection algorithms
- Anomaly scoring
- Fraud pattern identification

### `app.investigator`
- Report generation
- Finding articulation
- Explainability features

### `app.graph`
- Network analysis
- Relationship mapping
- Transaction flow visualization

### `app.auth`
- User authentication
- JWT token management
- RBAC (role-based access control)

---

## 🔐 Security Features

- **JWT Authentication** — Secure token-based authentication
- **Rate Limiting** — Protects against brute force and DOS attacks
- **Audit Logging** — Complete trail of all operations
- **CORS Protection** — Configurable cross-origin policy
- **Input Validation** — Pydantic-based schema validation
- **Secure Configuration** — Environment-based secrets management

---

## 📝 Version History

See [releases/](releases/) for detailed version notes:
- **v0.2.0** — Added authentication, rate limiting, and hardening
- **v0.1.0** — Initial release with core audit features

---

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'Add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see LICENSE file for details.

---

## 📧 Support & Contact

For questions, issues, or suggestions:
- GitHub Issues: [Open an issue](https://github.com/ullasdewangan09/Fin_Sentry/issues)
- Project Lead: [Ullas Dewangan](https://github.com/ullasdewangan09)

---

**FinSentry** — *Securing Financial Integrity Through Intelligent Automation* 🛡️