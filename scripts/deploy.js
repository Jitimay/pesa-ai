const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

async function main() {
  const network   = await hre.ethers.provider.getNetwork();
  const timestamp = new Date().toISOString();

  // 1. Deploy PesaHSP (testnet stand-in for official HSP token)
  console.log("Deploying PesaHSP...");
  const hspFactory  = await hre.ethers.getContractFactory("PesaHSP");
  const hspContract = await hspFactory.deploy();
  await hspContract.waitForDeployment();
  const hspAddress  = await hspContract.getAddress();
  console.log("PesaHSP deployed to:", hspAddress);

  // 2. Deploy PesaAI with HSP token address
  console.log("Deploying PesaAI...");
  const pesaFactory  = await hre.ethers.getContractFactory("PesaAI");
  const pesaContract = await pesaFactory.deploy(hspAddress);
  await pesaContract.waitForDeployment();
  const pesaAddress  = await pesaContract.getAddress();
  console.log("PesaAI deployed to:", pesaAddress);

  const deployment = {
    timestamp,
    network: { name: network.name, chainId: Number(network.chainId) },
    contracts: {
      PesaHSP: {
        address:  hspAddress,
        explorer: `https://testnet-explorer.hsk.xyz/address/${hspAddress}`,
        note:     "Testnet HSP stand-in. Replace with official HSP address via setHspToken()",
      },
      PesaAI: {
        address:  pesaAddress,
        explorer: `https://testnet-explorer.hsk.xyz/address/${pesaAddress}`,
      },
    },
  };

  // Persist deployments
  const outputPath = path.join(process.cwd(), "deployments.json");
  let existing = [];
  if (fs.existsSync(outputPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch (_) {
      existing = [];
    }
  }
  existing.push(deployment);
  fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

  console.log("\n=== Deployment complete ===");
  console.log("PesaHSP :", hspAddress);
  console.log("PesaAI  :", pesaAddress);
  console.log("\nAdd these to your .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${pesaAddress}`);
  console.log(`NEXT_PUBLIC_HSP_TOKEN_ADDRESS=${hspAddress}`);
  console.log("\nExplorer links:");
  console.log(`  PesaHSP : https://testnet-explorer.hsk.xyz/address/${hspAddress}`);
  console.log(`  PesaAI  : https://testnet-explorer.hsk.xyz/address/${pesaAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
