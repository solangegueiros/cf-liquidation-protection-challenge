const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy tokens
  const TokenvETH = await ethers.getContractFactory("TokenvETH");
  const vETH = await TokenvETH.deploy();
  await vETH.waitForDeployment();
  console.log("TokenvETH deployed:", await vETH.getAddress());

  const TokenvUSD = await ethers.getContractFactory("TokenvUSD");
  const vUSD = await TokenvUSD.deploy();
  await vUSD.waitForDeployment();
  console.log("TokenvUSD deployed:", await vUSD.getAddress());

  // 2. Deploy ChallengeLending
  const ChallengeLending = await ethers.getContractFactory("ChallengeLending");
  const lending = await ChallengeLending.deploy(
    await vETH.getAddress(),
    await vUSD.getAddress()
  );
  await lending.waitForDeployment();
  console.log("ChallengeLending deployed:", await lending.getAddress());

  // 3. Grant ADMIN_ROLE on both tokens to ChallengeLending
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const lendingAddress = await lending.getAddress();

  await (await vETH.grantRole(ADMIN_ROLE, lendingAddress)).wait();
  console.log("ADMIN_ROLE granted to ChallengeLending on TokenvETH");

  await (await vUSD.grantRole(ADMIN_ROLE, lendingAddress)).wait();
  console.log("ADMIN_ROLE granted to ChallengeLending on TokenvUSD");

  console.log("\n--- Deployment complete ---");
  console.log("TokenvETH:        ", await vETH.getAddress());
  console.log("TokenvUSD:        ", await vUSD.getAddress());
  console.log("ChallengeLending: ", await lending.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
