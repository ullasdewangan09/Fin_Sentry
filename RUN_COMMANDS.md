# Run Commands (Any Local Machine)

This file is a copy-paste command list to run the full project locally.

## 0) Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- Git

## 1) Clone + Backend Setup

### Windows PowerShell

```powershell
git clone <YOUR_REPO_URL>
cd "INNOVAT3"
python -m venv .venv_local
.\.venv_local\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

**Then update `.env` with these critical values:**

```powershell
# Generate a strong JWT_SECRET_KEY (run this to generate 32 random chars):
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
Write-Host "JWT_SECRET_KEY=$secret"
# Copy the output to .env file, replace the JWT_SECRET_KEY value

# Optional: Add GROQ_API_KEY if you have one (get from https://console.groq.com)
```

### macOS / Linux

```bash
git clone <YOUR_REPO_URL>
cd INNOVAT3
python3 -m venv .venv_local
source .venv_local/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

**Then update `.env` with these critical values:**

```bash
# Generate a strong JWT_SECRET_KEY (run this to generate 32 random chars):
openssl rand -base64 32
# Copy the output to .env file, replace the JWT_SECRET_KEY value

# Optional: Add GROQ_API_KEY if you have one (get from https://console.groq.com)
```

## 2) Frontend Setup

```bash
cd frontend/fintwin-command-main
npm install
cd ../..
```

## 3) Enable Real Local On-Chain Mode (Recommended)

This deploys both Web3 contracts locally and writes required env vars to `.env`.

### Windows PowerShell (one command)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_web3_local.ps1
```

### macOS / Linux (manual)

Terminal 1:

```bash
cd web3
npm install
npm run node
```

Terminal 2:

```bash
cd web3
npm run deploy:local
```

## 4) Run Services

### Terminal A: Backend API

#### Windows PowerShell

```powershell
cd "INNOVAT3"
.\.venv_local\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### macOS / Linux

```bash
cd INNOVAT3
source .venv_local/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal B: Frontend

```bash
cd frontend/fintwin-command-main
npm run dev
```

### Terminal C: Local Chain (only if not already running)

```bash
cd web3
npm run node
```

## 5) Open App + Login

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`

Demo credentials:

- `admin / Admin@12345`
- `auditor / Audit@12345`
- `analyst / Analyst@12345`

## 6) Quick Web3 Checks in UI

1. Go to `Cases`, expand a case.
2. Click anchor button (link icon) and badge button.
3. Go to `Trust Ledger`.
4. Confirm statuses show `submitted` (real local chain) instead of `simulated`.

## 7) Common Issues

### Security Configuration Warnings

If you see warnings like `[SECURITY-CONFIG] WARNING: JWT_SECRET_KEY is missing/weak`:

1. Open `.env` file
2. Replace `JWT_SECRET_KEY=your_random_32_character_secret_key_here` with an actual random value (see section 1 above for generation commands)
3. Restart the backend server

For `GROQ_API_KEY not set`: This is optional. Only set it if you want AI narrative/chat features. Get a key from https://console.groq.com

### Other Common Issues

- If you still see `simulated`, restart backend after `.env` is updated.
- Keep the Hardhat node terminal running (`npm run node` in `web3`).
- If `python` command fails on Windows, use:
  - `.\.venv_local\Scripts\python.exe -m ...`
