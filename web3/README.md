# Web3 Integration - Audit Trail & Compliance Badges

This module provides blockchain-based audit trail anchoring and NFT-style compliance badge issuance for INNOVAT3. All functionality gracefully degrades to local proofs if Web3 variables are not configured.

## Overview

The Web3 module consists of two main Solidity contracts:

1. **AuditEventRegistry** - Immutable event anchoring
2. **AuditBadgeRegistry** - Compliance badge issuance

Both contracts are deployed on a local Hardhat network for local development or on public networks for production.

## Smart Contracts

### AuditEventRegistry

**Purpose:** Immutably anchor audit events to the blockchain

**Location:** `web3/contracts/AuditEventRegistry.sol`

**Data Model:**
```solidity
struct AuditEvent {
    bytes32 anchorId;           // Stable backend-generated ID
    bytes32 eventHash;          // Canonical hash of event (SHA-256)
    string eventType;           // Category: risk.detected, case.closed, etc.
    string entityId;            // Business ID: case/transaction/invoice/vendor
    string ipfsCid;             // Optional IPFS content identifier
    uint256 occurredAt;         // Business event timestamp
    uint256 anchoredAt;         // Block timestamp
    address submitter;          // Account that submitted proof
}
```

**Key Methods:**
- `anchorEvent(...)` - Record audit event on-chain
- `getEvent(bytes32 anchorId)` - Retrieve anchored event
- `setRelayer(address, bool)` - Grant/revoke relayer permission
- `owner()` - Get contract owner

**Features:**
- ✅ Immutable event recording
- ✅ Role-based access (owner + relayers)
- ✅ IPFS integration support
- ✅ Event indexing by entityId

### AuditBadgeRegistry

**Purpose:** Issue NFT-style compliance badges linked to investigation cases

**Location:** `web3/contracts/AuditBadgeRegistry.sol`

**Data Model:**
```solidity
struct ComplianceBadge {
    uint256 badgeId;              // Unique badge ID
    bytes32 caseAnchorId;         // Linked case anchor
    address issuedTo;             // Badge recipient
    string badgeCriteria;         // Compliance criteria met
    uint256 issuedAt;             // Badge issuance timestamp
    bool revoked;                 // Revocation status
}
```

**Key Methods:**
- `issueBadge(...)` - Create new compliance badge
- `revokeBadge(uint256)` - Revoke a badge
- `getBadge(uint256)` - Retrieve badge details
- `getBadgesByCase(bytes32)` - Get all badges for a case

**Features:**
- ✅ NFT-style badge management
- ✅ Revocation capability
- ✅ Case-linked verification
- ✅ Recipient tracking

## Contract Deployment

### Automated Setup (Recommended)

Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_web3_local.ps1
```

This script automatically:
1. Installs Hardhat dependencies in `web3/`
2. Starts a local Hardhat network on `http://127.0.0.1:8545`
3. Compiles contracts
4. Deploys both contracts
5. Updates root `.env` with:
   - `WEB3_RPC_URL`
   - `WEB3_RELAYER_PRIVATE_KEY`
   - `WEB3_CONTRACT_ADDRESS`
   - `WEB3_BADGE_CONTRACT_ADDRESS`

### Manual Deployment

```powershell
# Navigate to web3 directory
cd web3

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Deploy to local network
# First, ensure local Hardhat node is running:
# npx hardhat node

# In another terminal:
npx hardhat run scripts/deploy.js --network localhost
```

## Backend Integration

The INNOVAT3 backend includes REST APIs for Web3 operations:

### Event Anchoring APIs

**Anchor Investigation Case**
```
POST /web3/anchor/case/{case_id}
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
    "case_summary": "Investigation findings",
    "ipfs_cid": "QmXxxx..." (optional)
}

Response:
{
    "anchor_id": "0xabc123...",
    "tx_hash": "0x123abc...",
    "status": "confirmed" | "simulated",
    "block_number": 12345
}
```

**Retrieve Proofs for Case**
```
GET /web3/proofs/case/{case_id}
Authorization: Bearer <JWT_TOKEN>

Response:
[
    {
        "anchor_id": "0xabc123...",
        "event_type": "case.investigation_complete",
        "occurred_at": "2024-01-15T10:30:00Z",
        "anchored_at": "2024-01-15T10:32:00Z",
        "tx_hash": "0x123abc...",
        "status": "confirmed" | "simulated"
    }
]
```

**Retrieve Single Proof**
```
GET /web3/proofs/{anchor_id}
Authorization: Bearer <JWT_TOKEN>

Response:
{
    "anchor_id": "0xabc123...",
    "event_hash": "0x456def...",
    "event_type": "case.investigation_complete",
    "entity_id": "case_12345",
    "ipfs_cid": "QmXxxx...",
    "occurred_at": 1705317000,
    "anchored_at": 1705317120,
    "submitter": "0x742d35Cc6634C0532925a3b844Bc9e7595f...",
    "status": "confirmed" | "simulated"
}
```

### Compliance Badge APIs

**Issue Badge for Case**
```
POST /web3/badges/case/{case_id}
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
    "badge_criteria": "Passed segregation of duties audit",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc9e..." (optional)
}

Response:
{
    "badge_id": 1,
    "case_anchor_id": "0xabc123...",
    "issued_at": "2024-01-15T10:35:00Z",
    "tx_hash": "0x789ghi..."
}
```

**Get Badges for Case**
```
GET /web3/badges/case/{case_id}
Authorization: Bearer <JWT_TOKEN>

Response:
[
    {
        "badge_id": 1,
        "case_anchor_id": "0xabc123...",
        "badge_criteria": "Passed segregation of duties audit",
        "issued_at": "2024-01-15T10:35:00Z",
        "revoked": false
    }
]
```

**Get Single Badge**
```
GET /web3/badges/{badge_id}
Authorization: Bearer <JWT_TOKEN>

Response:
{
    "badge_id": 1,
    "case_anchor_id": "0xabc123...",
    "issued_to": "0x742d35Cc6634C0532925a3b844Bc9e...",
    "badge_criteria": "Passed segregation of duties audit",
    "issued_at": 1705317300,
    "revoked": false
}
```

**Get Verification Overview**
```
GET /web3/verification/overview
Authorization: Bearer <JWT_TOKEN>

Response:
{
    "total_events_anchored": 42,
    "total_badges_issued": 18,
    "network_status": "connected" | "disconnected" | "simulated",
    "last_anchor_timestamp": "2024-01-15T10:32:00Z",
    "contract_address": "0x1234567890...",
    "badge_contract_address": "0xabcdef0123..."
}
```

## Access Control

### Role-Based Permissions

| Endpoint | Admin | Auditor | Analyst |
|----------|-------|---------|---------|
| Anchor case | ✅ | ❌ | ✅ |
| View proofs | ✅ | ✅ | ✅ |
| Issue badges | ✅ | ❌ | ✅ |
| View badges | ✅ | ✅ | ✅ |
| Verification overview | ✅ | ✅ | ✅ |

## Graceful Degradation

If Web3 environment variables are not configured, the system:

1. **Still creates proof records** locally with `status="simulated"`
2. **Does not attempt blockchain calls** - avoids errors
3. **Maintains identical API responses** - frontend is unaware
4. **Enables local testing** without blockchain infrastructure

Configure `.env`:
```env
# Leave empty or unset to trigger graceful degradation
WEB3_RPC_URL=
WEB3_RELAYER_PRIVATE_KEY=
WEB3_CONTRACT_ADDRESS=
WEB3_BADGE_CONTRACT_ADDRESS=
```

## ABI Files

Contract ABIs are available for integration with other applications:

- `web3/abi/AuditEventRegistry.abi.json` - Event registry ABI
- `web3/abi/AuditBadgeRegistry.abi.json` - Badge registry ABI

## Configuration

### Local Development (.env)

```env
WEB3_RPC_URL=http://127.0.0.1:8545
WEB3_RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb476c6b8d6c1f02960247590cbaa
WEB3_CONTRACT_ADDRESS=0x5FbDB2315678afccb333f8a9fcff11ea142E3C9A7
WEB3_BADGE_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

### Production Deployment

For Ethereum mainnet or testnet:
1. Set `WEB3_RPC_URL` to network RPC endpoint
2. Set `WEB3_RELAYER_PRIVATE_KEY` to relayer account private key
3. Deploy contracts using `hardhat.config.js` with appropriate network
4. Update `.env` with deployed contract addresses

## Development Workflow

```powershell
# Start local Hardhat node (in one terminal)
cd web3
npx hardhat node

# In another terminal, deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Run contract tests
npx hardhat test

# Start backend with Web3 enabled
cd ..
uvicorn app.main:app --reload
```

## Contract Verification

Verify deployed contracts on Etherscan (for testnet/mainnet):

```powershell
npx hardhat verify --network <network> <contract_address> <constructor_args>
```

## Troubleshooting

**Q: "Web3 provider not found" error**
- A: Web3 environment variables not set. Edit `.env` or use graceful degradation.

**Q: "Relayer not authorized" error**
- A: Relayer address must be enabled on contract. Call `setRelayer(address, true)` as owner.

**Q: "RPC endpoint not responding"**
- A: Ensure Hardhat node or network RPC is accessible. Check `WEB3_RPC_URL`.

**Q: Contracts deployed but not found**
- A: Verify contract addresses in `.env` match actual deployments. Check `npx hardhat run scripts/deploy.js --network localhost`

## References

- [Solidity Documentation](https://docs.soliditylang.org/)
- [Hardhat Documentation](https://hardhat.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [ethers.js Documentation](https://docs.ethers.org/)

---

**Version:** 0.2.0
**Last Updated:** March 2026
