const { ethers } = require("hardhat");

// Existing token addresses — do NOT redeploy these
const VETH_ADDRESS = "0x5dED1a40c3D56dA42E7f932f781c0432556c9814";
const VUSD_ADDRESS = "0x6Fe92Ead5299040f50F095860b5A0A7A2D4041A2";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy ChallengeLending with correct token order
  const ChallengeLending = await ethers.getContractFactory("ChallengeLending");
  const lending = await ChallengeLending.deploy(VETH_ADDRESS, VUSD_ADDRESS);
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("ChallengeLending deployed:", lendingAddress);

  // Grant ADMIN_ROLE on both existing tokens
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE"));
  const vETH = await ethers.getContractAt("TokenvETH", VETH_ADDRESS);
  const vUSD = await ethers.getContractAt("TokenvUSD", VUSD_ADDRESS);

  await (await vETH.grantRole(ADMIN_ROLE, lendingAddress)).wait();
  console.log("ADMIN_ROLE granted to ChallengeLending on TokenvETH");

  await (await vUSD.grantRole(ADMIN_ROLE, lendingAddress)).wait();
  console.log("ADMIN_ROLE granted to ChallengeLending on TokenvUSD");

  console.log("\n--- Update these addresses ---");
  console.log("ChallengeLending:", lendingAddress);
  console.log("TokenvETH:       ", VETH_ADDRESS, "(unchanged)");
  console.log("TokenvUSD:       ", VUSD_ADDRESS, "(unchanged)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
