import {
  CronCapability,
  HTTPClient,
  // NITRO_REGIONS,
  Runner,
  handlerInTee,
  type TeeRuntime,
  type Workflow,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Config ───────────────────────────────────────────────────────────────────

type SecretsConfig = {
  private_key_id: string;
  min_hf_trigger_id: string;
  target_hf_id: string;
  max_repay_pct_id: string;
  max_deposit_units_id: string;
};

export type Config = {
  schedule: string;
  rpc_url: string;
  lending_address: string;
  veth_address: string;
  vusd_address: string;
  secrets_ids: SecretsConfig;
};

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const GET_USER_POSITION_ABI = [
  {
    name: "getUserPosition",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "collateral", type: "uint256" },
          { name: "debt", type: "uint256" },
          { name: "hf", type: "uint256" },
          { name: "lastUpdateTime", type: "uint256" },
          { name: "cumulativeDebtTime", type: "uint256" },
        ],
      },
    ],
  },
] as const;

const VETH_PRICE_ABI = [
  { name: "vETHPrice", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_READ_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const REPAY_ABI = [
  { name: "repay", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

const DEPOSIT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const LIQUI_THRESHOLD = 78n;
const MAX_UINT256 = (1n << 256n) - 1n;
const SEPOLIA_CHAIN_ID = 11155111;
const GAS_APPROVE = 80000n;
const GAS_REPAY = 150000n;
const GAS_DEPOSIT = 150000n;
const JSON_HEADERS = { "Content-Type": "application/json" };

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = {
  collateral: bigint;
  debt: bigint;
  hf: bigint;
  lastUpdateTime: bigint;
  cumulativeDebtTime: bigint;
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

const decodeBody = (raw: Uint8Array): string => new TextDecoder().decode(raw);

const parseJsonBody = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`invalid json: ${e}; body=${raw}`);
  }
};

const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// Converts a hex string returned by JSON-RPC (e.g. "0x5") to bigint.
const parseHex = (v: unknown): bigint => {
  const s = asString(v, "0x0");
  try {
    return BigInt(s.startsWith("0x") || s.startsWith("0X") ? s : `0x${s}`);
  } catch {
    return 0n;
  }
};

// Returns the smallest of three bigints.
const minBigInt = (a: bigint, b: bigint, c: bigint): bigint => {
  let m = a < b ? a : b;
  return m < c ? m : c;
};

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

const jsonRpc = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  method: string,
  params: unknown[],
  id = 1,
): Record<string, unknown> => {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id });
  const encodedBody = Buffer.from(body).toString("base64");

  const resp = client
    .sendRequest(runtime, { url: rpcUrl, method: "POST", body: encodedBody, headers: JSON_HEADERS })
    .result();

  const raw = decodeBody(resp.body);
  if (resp.statusCode >= 400) {
    throw new Error(`rpc ${method} http-error=${resp.statusCode} body=${raw}`);
  }

  const json = parseJsonBody(raw);
  if (json.error) {
    const errMsg = asString((json.error as Record<string, unknown>).message, String(json.error));
    throw new Error(`rpc ${method} error: ${errMsg}`);
  }
  return json;
};

const ethCall = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  to: string,
  data: string,
): string => {
  const json = jsonRpc(runtime, client, rpcUrl, "eth_call", [{ to, data }, "latest"], 1);
  return asString(json.result);
};

const ethGetNonce = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  address: string,
): number => {
  const json = jsonRpc(runtime, client, rpcUrl, "eth_getTransactionCount", [address, "latest"], 2);
  return Number(parseHex(json.result));
};

const ethGasPrice = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
): bigint => {
  const json = jsonRpc(runtime, client, rpcUrl, "eth_gasPrice", [], 3);
  return parseHex(json.result);
};

const ethSendRawTx = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  signedTx: string,
): string => {
  const json = jsonRpc(runtime, client, rpcUrl, "eth_sendRawTransaction", [signedTx], 4);
  return asString(json.result);
};

// ─── Contract reads ───────────────────────────────────────────────────────────

const readPosition = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  lendingAddress: string,
  userAddress: Address,
): Position => {
  const data = encodeFunctionData({
    abi: GET_USER_POSITION_ABI,
    functionName: "getUserPosition",
    args: [userAddress],
  });
  const result = ethCall(runtime, client, rpcUrl, lendingAddress, data);
  return decodeFunctionResult({
    abi: GET_USER_POSITION_ABI,
    functionName: "getUserPosition",
    data: result as `0x${string}`,
  }) as unknown as Position;
};

const readVethPrice = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  lendingAddress: string,
): bigint => {
  const data = encodeFunctionData({ abi: VETH_PRICE_ABI, functionName: "vETHPrice" });
  const result = ethCall(runtime, client, rpcUrl, lendingAddress, data);
  return decodeFunctionResult({
    abi: VETH_PRICE_ABI,
    functionName: "vETHPrice",
    data: result as `0x${string}`,
  }) as bigint;
};

const readBalance = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  tokenAddress: string,
  owner: Address,
): bigint => {
  const data = encodeFunctionData({ abi: ERC20_READ_ABI, functionName: "balanceOf", args: [owner] });
  const result = ethCall(runtime, client, rpcUrl, tokenAddress, data);
  return decodeFunctionResult({
    abi: ERC20_READ_ABI,
    functionName: "balanceOf",
    data: result as `0x${string}`,
  }) as bigint;
};

const readAllowance = (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  tokenAddress: string,
  owner: Address,
  spender: Address,
): bigint => {
  const data = encodeFunctionData({ abi: ERC20_READ_ABI, functionName: "allowance", args: [owner, spender] });
  const result = ethCall(runtime, client, rpcUrl, tokenAddress, data);
  return decodeFunctionResult({
    abi: ERC20_READ_ABI,
    functionName: "allowance",
    data: result as `0x${string}`,
  }) as bigint;
};

// ─── Transaction signing and sending ─────────────────────────────────────────

// NOTE: privateKeyToAccount and signTransaction use @noble/curves (pure JS).
// Runs inside the CRE TEE WASM environment.
const sendTx = async (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  account: ReturnType<typeof privateKeyToAccount>,
  to: Address,
  callData: `0x${string}`,
  gas: bigint,
  nonce: number,
  gasPrice: bigint,
): Promise<string> => {
  const signedTx = await account.signTransaction({
    chainId: SEPOLIA_CHAIN_ID,
    to,
    data: callData,
    gas,
    gasPrice,
    nonce,
    value: 0n,
  });
  return ethSendRawTx(runtime, client, rpcUrl, signedTx);
};

const ensureApproval = async (
  runtime: TeeRuntime<Config>,
  client: HTTPClient,
  rpcUrl: string,
  account: ReturnType<typeof privateKeyToAccount>,
  tokenAddress: string,
  spenderAddress: string,
  requiredAmount: bigint,
  nonce: number,
  gasPrice: bigint,
): Promise<{ txHash: string | null; nonce: number }> => {
  const allowance = readAllowance(
    runtime,
    client,
    rpcUrl,
    tokenAddress,
    account.address,
    spenderAddress as Address,
  );

  if (allowance >= requiredAmount) {
    return { txHash: null, nonce };
  }

  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spenderAddress as Address, MAX_UINT256],
  });

  const txHash = await sendTx(
    runtime,
    client,
    rpcUrl,
    account,
    tokenAddress as Address,
    approveData,
    GAS_APPROVE,
    nonce,
    gasPrice,
  );

  return { txHash, nonce: nonce + 1 };
};

// ─── Cron trigger handler ─────────────────────────────────────────────────────

export const onCronTrigger = async (runtime: TeeRuntime<Config>): Promise<string> => {
  const { rpc_url, lending_address, veth_address, vusd_address, secrets_ids } = runtime.config;

  // 1. Fetch private policy from CRE secrets (stays inside the TEE)
  const secrets = runtime
    .getSecrets([
      { id: secrets_ids.private_key_id },
      { id: secrets_ids.min_hf_trigger_id },
      { id: secrets_ids.target_hf_id },
      { id: secrets_ids.max_repay_pct_id },
      { id: secrets_ids.max_deposit_units_id },
    ])
    .result();

  const privateKey = secrets[secrets_ids.private_key_id].value as `0x${string}`;
  // min_hf_trigger and target_hf are stored ×100 to match the contract:
  //   108 = HF 1.08, 115 = HF 1.15
  const minHfTrigger = BigInt(secrets[secrets_ids.min_hf_trigger_id].value);
  const targetHf = BigInt(secrets[secrets_ids.target_hf_id].value);
  // max_repay_pct: integer 0-100 (e.g. 15 = max 15% of current debt)
  const maxRepayPct = BigInt(secrets[secrets_ids.max_repay_pct_id].value);
  // max_deposit_units: raw vETH units (100 = 1.00 vETH)
  const maxDepositUnits = BigInt(secrets[secrets_ids.max_deposit_units_id].value);

  runtime.log("liquidation-getsecrets-ok");

  // 2. Derive wallet address from the private key
  const account = privateKeyToAccount(privateKey);
  const walletAddress = account.address;

  // 3. Read on-chain state
  const client = new HTTPClient();

  const position = readPosition(runtime, client, rpc_url, lending_address, walletAddress);
  const vethPrice = readVethPrice(runtime, client, rpc_url, lending_address);

  runtime.log(
    `position-read hf=${position.hf} collateral=${position.collateral} debt=${position.debt} vethPrice=${vethPrice}`,
  );

  // 4. Check if position is safe or already closed
  if (position.debt === 0n || position.hf > minHfTrigger) {
    runtime.log(`position-safe hf=${position.hf} threshold=${minHfTrigger}`);
    return "SAFE";
  }

  runtime.log(`position-at-risk hf=${position.hf} min_hf=${minHfTrigger} target_hf=${targetHf}`);

  // 5. Compute repay amount to reach targetHf
  //
  // HF = collateral × vETHPrice × LIQUI_THRESHOLD / (100 × debt)
  // After repaying R: new_debt = debt - R
  // target_hf = collateral × vETHPrice × LIQUI_THRESHOLD / (100 × new_debt)
  // → new_debt = collateral × vETHPrice × LIQUI_THRESHOLD / (100 × target_hf)
  // → R = debt - new_debt
  const targetDebt = (position.collateral * vethPrice * LIQUI_THRESHOLD) / (100n * targetHf);
  const repayNeeded = position.debt > targetDebt ? position.debt - targetDebt : 0n;
  const maxRepayByPct = (position.debt * maxRepayPct) / 100n;
  const vusdBalance = readBalance(runtime, client, rpc_url, vusd_address, walletAddress);

  const repayAmount = minBigInt(repayNeeded, maxRepayByPct, vusdBalance);

  // 6. If repaying alone is insufficient, also compute collateral deposit needed
  //
  // After repaying R: new_debt = debt - R
  // target_hf = (collateral + D) × vETHPrice × LIQUI_THRESHOLD / (100 × new_debt)
  // → D = target_hf × 100 × new_debt / (vETHPrice × LIQUI_THRESHOLD) - collateral
  let depositAmount = 0n;
  const debtAfterRepay = position.debt - repayAmount;

  if (debtAfterRepay > 0n) {
    const neededCollateral =
      (targetHf * 100n * debtAfterRepay) / (vethPrice * LIQUI_THRESHOLD);

    if (neededCollateral > position.collateral) {
      const depositNeeded = neededCollateral - position.collateral;
      const vethBalance = readBalance(runtime, client, rpc_url, veth_address, walletAddress);
      depositAmount = minBigInt(depositNeeded, maxDepositUnits, vethBalance);
    }
  }

  if (repayAmount === 0n && depositAmount === 0n) {
    runtime.log("no-action-possible no-reserve");
    return "NO_RESERVE";
  }

  runtime.log(
    `action-plan repay=${repayAmount} deposit=${depositAmount}`,
  );

  // 7. Execute on-chain actions
  let nonce = ethGetNonce(runtime, client, rpc_url, walletAddress);
  const gasPrice = ethGasPrice(runtime, client, rpc_url);
  const txHashes: string[] = [];

  if (repayAmount > 0n) {
    const { txHash: approveTx, nonce: nonceAfterApprove } = await ensureApproval(
      runtime,
      client,
      rpc_url,
      account,
      vusd_address,
      lending_address,
      repayAmount,
      nonce,
      gasPrice,
    );
    if (approveTx) {
      runtime.log(`vusd-approve-tx=${approveTx}`);
      txHashes.push(approveTx);
    }
    nonce = nonceAfterApprove;

    const repayData = encodeFunctionData({
      abi: REPAY_ABI,
      functionName: "repay",
      args: [repayAmount],
    });

    const repayTx = await sendTx(
      runtime,
      client,
      rpc_url,
      account,
      lending_address as Address,
      repayData,
      GAS_REPAY,
      nonce,
      gasPrice,
    );

    runtime.log(`repay-tx=${repayTx} amount=${repayAmount}`);
    txHashes.push(repayTx);
    nonce++;
  }

  if (depositAmount > 0n) {
    const { txHash: approveTx, nonce: nonceAfterApprove } = await ensureApproval(
      runtime,
      client,
      rpc_url,
      account,
      veth_address,
      lending_address,
      depositAmount,
      nonce,
      gasPrice,
    );
    if (approveTx) {
      runtime.log(`veth-approve-tx=${approveTx}`);
      txHashes.push(approveTx);
    }
    nonce = nonceAfterApprove;

    const depositData = encodeFunctionData({
      abi: DEPOSIT_ABI,
      functionName: "deposit",
      args: [depositAmount],
    });

    const depositTx = await sendTx(
      runtime,
      client,
      rpc_url,
      account,
      lending_address as Address,
      depositData,
      GAS_DEPOSIT,
      nonce,
      gasPrice,
    );

    runtime.log(`deposit-tx=${depositTx} amount=${depositAmount}`);
    txHashes.push(depositTx);
  }

  return JSON.stringify({
    status: "DEFENDED",
    repayAmount: repayAmount.toString(),
    depositAmount: depositAmount.toString(),
    txHashes,
  });
};

// ─── Workflow init ────────────────────────────────────────────────────────────

export const initWorkflow = (config: Config): Workflow<Config> => {
  if (
    !config.schedule ||
    !config.rpc_url ||
    !config.lending_address ||
    !config.veth_address ||
    !config.vusd_address
  ) {
    throw new Error(
      "config requires schedule, rpc_url, lending_address, veth_address, vusd_address",
    );
  }

  if (
    !config.secrets_ids?.private_key_id ||
    !config.secrets_ids?.min_hf_trigger_id ||
    !config.secrets_ids?.target_hf_id ||
    !config.secrets_ids?.max_repay_pct_id ||
    !config.secrets_ids?.max_deposit_units_id
  ) {
    throw new Error("config requires all secrets_ids fields");
  }

  const cron = new CronCapability();

  return [
    handlerInTee(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger,
      {},
      // Uncomment for production (Nitro TEE):
      // [{ tee: "nitro", regions: [NITRO_REGIONS[0]] }],
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
