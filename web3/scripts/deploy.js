const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function upsertEnv(envPath, updates) {
  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8").split(/\r?\n/)
    : [];

  const map = new Map();
  for (const line of existing) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1);
    map.set(key, val);
  }
  Object.entries(updates).forEach(([k, v]) => map.set(k, String(v)));

  const out = Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
  fs.writeFileSync(envPath, out, "utf-8");
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const EventRegistry = await hre.ethers.getContractFactory("AuditEventRegistry");
  const eventRegistry = await EventRegistry.deploy(deployer.address);
  await eventRegistry.waitForDeployment();
  const eventAddress = await eventRegistry.getAddress();

  const BadgeRegistry = await hre.ethers.getContractFactory("AuditBadgeRegistry");
  const badgeRegistry = await BadgeRegistry.deploy(deployer.address);
  await badgeRegistry.waitForDeployment();
  const badgeAddress = await badgeRegistry.getAddress();

  const root = path.resolve(__dirname, "..", "..");
  const envPath = path.join(root, ".env");
  const updates = {
    WEB3_RPC_URL: "http://127.0.0.1:8545",
    WEB3_CHAIN_ID: "31337",
    WEB3_NETWORK_NAME: "hardhat-local",
    WEB3_CONTRACT_ADDRESS: eventAddress,
    WEB3_BADGE_CONTRACT_ADDRESS: badgeAddress,
    WEB3_BADGE_CHAIN_ID: "31337",
    WEB3_BADGE_NETWORK_NAME: "hardhat-local",
    WEB3_RELAYER_PRIVATE_KEY:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  };
  upsertEnv(envPath, updates);

  const summary = {
    deployed_by: deployer.address,
    audit_event_registry: eventAddress,
    audit_badge_registry: badgeAddress,
    network: "localhost (hardhat 31337)"
  };

  const outputPath = path.join(root, "web3", "deployment.local.json");
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Updated ${envPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
