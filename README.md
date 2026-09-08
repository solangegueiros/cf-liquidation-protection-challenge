# Automated Liquidation Protection Challenge 
# using CRE Confidential Workflows

## Challenge official smart contracts

Tokens ERC20 (Ethereum Sepolia):
- virtual ETH - vETH - [0x5dED1a40c3D56dA42E7f932f781c0432556c9814](https://sepolia.etherscan.io/address/0x5dED1a40c3D56dA42E7f932f781c0432556c9814)
- virtual USD - vUSD - [0x6Fe92Ead5299040f50F095860b5A0A7A2D4041A2](https://sepolia.etherscan.io/address/0x6Fe92Ead5299040f50F095860b5A0A7A2D4041A2)

The Lending and Borrowing / Liquidation Smart Contract Challenge address (Ethereum Sepolia):
[0x63b918368a2c3c08f3b3eCEdc8eA6c49E674c4B7](https://sepolia.etherscan.io/address/0x63b918368a2c3c08f3b3eCEdc8eA6c49E674c4B7)

# The challenge

Build a Confidential Workflow that protects a virtual ETH-collateral/vUSD-debt position during simulated market movements.

The workflow must:

* Avoid liquidation.  
* Preserve the benefit of keeping the loan open.  
* Use emergency capital efficiently.  
* Keep sensitive protection rules and credentials private.

## How to do it

You can create and deploy your workflow until the hackathon submission deadline.

Fork this repo to do local simulations, or even test your workflow yourself, deploying a personal challenge smart contract / tokens. 
If you deploy your own contracts, in order to use the function join, you need to grant the minter role to the challenge contract, in both tokens (The function join mint tokens, so it must be in the role).

Until the hackathon submission deadline, update your workflow to use the official challenge smart contract address, defined on this readme file.

Use the function `join()` to join the challenge in the official smart contract.

> Join from Sept 8 to hackathon submission deadline.

After the deadline, Chainlink team will run the scenarios, during the next 24h, and discover the winner.

> You can not update your workflow after the hackathon submission deadline.


### Private workflow inputs
The following should remain inside the Confidential Workflow:

* Health-factor trigger for intervention.  
* Target health factor after intervention.  
* Maximum vUSD repayment allowed.  
* Maximum additional vETH collateral allowed.  
* Choice and priority of protection actions.  
* Safety margin applied during volatile markets.  
* Cooldown between interventions.  
* Full-repayment or emergency-exit threshold.  
* Wallet authorization or signing credentials.  
* Private RPC or API credentials.

For example, a participant might privately configure:

```
Intervene when health factor < 1.08
Restore health factor to 1.18
Repay no more than 15% of the original vUSD debt
Add vETH collateral only if repayment is insufficient
Wait at least two price intervals between non-critical actions
```

These values should not appear in the public contract, repository, workflow logs or configuration files.

The final transaction remains public. 
Observers will see when the workflow acts and how much it repays or adds, so they may infer parts of the strategy. 

> The confidentiality objective is to protect the inputs and decision logic before execution—not to make public-chain actions invisible.

## The Lending and Borrowing / Liquidation Smart Contract

The Lending and Borrowing / Liquidation Smart Contract is deployed on Ethereum Sepolia.

- Creates an identical virtual position for every participant.
- Uses virtual assets: vETH as collateral and vUSD as debt (both with 2 decimal places).
- Calculates the health factor HF.
- Supports virtual `repay vUSD` and `deposit vETH collateral` actions.
- Tracks liquidations, capital usage, interventions and time-weighted debt.
- Emits all actions and results onchain.
- No real collateral or debt tokens are required. 
- Participants need only enough Sepolia ETH for gas.

### Smart Contract parameters

| Parameter | Value | Description |
| ----- | ----- | ----- |
| `MAX_LTV` | 75% | Maximum loan-to-value ratio for new borrows |
| `LIQUI_THRESHOLD` | 78% | Health factor falls below 1.00 when LTV exceeds this |
| `LIQUI_PENALTY` | 5% | Extra collateral seized from liquidated positions |
| `vETHPrice` (initial) | 2000.00 vUSD/vETH | Updated by organizer each round |

> User HF = userCollateral * vETHPrice * LIQUI_THRESHOLD / userDebt

### Starting position (per participant, on `join()`)

| Item | Amount | Description |
| ----- | ----- | ----- |
| vETH received | 5.00 vETH | Free balance to use as emergency collateral |
| vETH collateral | 5.00 vETH | Locked as collateral from the start |
| vUSD received | 3000.00 vUSD | Free balance to use for emergency repayments |
| vUSD debt | 7000.00 vUSD | Outstanding debt from the start |
| Starting HF | ~1.11 | `(5.00 × 2000.00 × 78%) / 7000.00` |

The time-weighted debt score (`cumulativeDebtTime`) is accumulated on-chain each time debt changes, tracking `debt × elapsed_seconds` for the loan-continuity metric.

The Chainlink Labs team controls the scenario lifecycle:

| Function | Event emitted | Description |
| ----- | ----- | ----- |
| `open()` | `ChallengeOpened` | Opens registration; participants can now call `join()`. |
| `close()` | `ChallengeClosed` | Closes registration; no new participants. |
| `start()` | `ChallengeStarted` | Sets the shared scenario clock; debt-time scoring begins for all participants from this moment. |
| `updatevETHPrice()` | `PriceUpdate` | Submits a vETH price update during a synchronized round. |
| `stop()` | `ChallengeStopped`, `LoanContinuityScored` | Ends the scenario; computes and stores the final `loanContinuityScore` (0–10000 basis points) on-chain for every participant. |


### **Market scenarios examples**

| Scenario | Example ETH price path | Expected behavior |
| ----- | ----- | ----- |
| Gradual decline | $2,000 → $1,850 → $1,750 → $1,650 → $1,550 | Make a proportionate intervention before liquidation. |
| Sudden crash | $2,000 → $1,700 → $1,625 → $1,450 | React quickly at the first dangerous update. |
| Temporary wick | $2,000 → $1,750 → $1,620 → $1,900 | Hold or intervene minimally rather than closing unnecessarily. |
| Two-stage decline | $2,000 → $1,750 → $1,650 → $1,650 → $1,500 | Create sufficient protection or perform an efficient second intervention. |
| Safe volatility | $2,000 → $1,800 → $1,950 → $1,750 → $2,050 | Avoid unnecessary interventions. |

### **Winner metric**

Each scenario produces a score out of 100:

| Component | Weight | Measurement |
| ----- | ----- | ----- |
| Liquidation protection | 40 | Whether the position survives the scenario. |
| Loan continuity | 20 | Time-weighted percentage of the original debt kept open. |
| Capital efficiency | 15 | Emergency vETH and vUSD consumed. |
| Confidentiality | 15 | Protection of private inputs, credentials and execution policy. |
| Intervention discipline | 10 | Avoiding unnecessary, excessive or repeated actions. |


#### **Loan continuity**

```
Loan Continuity =
    Sum of (Debt During Interval × Interval Duration)
    -------------------------------------------------
       Initial Debt × Total Scenario Duration
```

#### **Confidentiality scoring**

| Requirement | Points |
| ----- | ----- |
| Trigger and target health factors remain private | 3 |
| Capital limits and action-selection policy remain private | 3 |
| Credentials are stored and used only as protected secrets | 3 |
| No private inputs appear in logs, errors or public configuration | 3 |
| Confidential execution evidence or an execution receipt is provided | 3 |


#### **Selecting the winner**

1. Run every workflow through all market scenarios.  
2. Calculate the score for each scenario.  
3. Add the confidentiality assessment.  
4. Average the scenario scores.  
5. Highest overall score wins.  
6. Use the worst scenario score as the first tie-breaker.  
7. Use the least emergency vETH/vUSD capital consumed as the second tie-breaker.

All participants receive identical positions, prices, timing and virtual capital allowances. 

The Sepolia contract provides an auditable record of inputs, actions and outcomes.

---

## The frontend

### Requirements

- Node.js 18+
- npm 9+
- A browser wallet (MetaMask or compatible) connected to **Ethereum Sepolia**

### Install and run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

The contract addresses are pre-configured. Connect your wallet (Sepolia), then use `join()` to enter the challenge.

### Build for production

```bash
npm run build
```

Output is in `frontend/dist/`.

---

## The workflow example — automated-liquidation-protection-workflow

A confidential CRE workflow that monitors your position on-chain and automatically repays debt or deposits collateral when the health factor drops below your private threshold.

**Architecture:**
- Runs inside a Nitro TEE (`handlerInTee`) — decision logic and private key never leave the enclave
- Reads position state directly from `ChallengeLending` via Ethereum JSON-RPC (`getUserPosition`, `vETHPrice`)
- Executes `repay()` and `deposit()` by signing transactions inside the TEE with the private key from CRE secrets

### Requirements

- [CRE CLI](https://docs.chain.link/cre/guides/cli/overview) installed
- [Bun](https://bun.sh/) >= 1.2.21
- CRE account with Early Access (for deployment; simulation works fine without it)
- The wallet (`CRE_ETH_PRIVATE_KEY`) must have already called `join()` on the challenge contract

### Install Dependencies

```bash
bun install --cwd ./automated-liquidation-protection-workflow
```

### Configure secrets

Copy `.env.example` to `.env` and fill in your private values:

```bash
cp .env.example .env
```

Set the policy parameters in `.env`:

```
# Ethereum private key (same wallet that called join())
CRE_ETH_PRIVATE_KEY=0x...

# Trigger intervention when HF drops to or below this value (×100)
# Example: 108 = HF 1.08
CRE_LIQUIDATION_MIN_HF_TRIGGER_VAR=108

# Target health factor to restore after intervention (×100)
# Example: 115 = HF 1.15
CRE_LIQUIDATION_TARGET_HF_VAR=115

# Maximum percentage of outstanding vUSD debt to repay per intervention
# Example: 15 = up to 15% of debt
CRE_LIQUIDATION_MAX_REPAY_PCT_VAR=15

# Maximum vETH collateral to deposit per intervention (raw units, 100 = 1.00 vETH)
# Example: 300 = up to 3.00 vETH
CRE_LIQUIDATION_MAX_DEPOSIT_UNITS_VAR=300
```

> These values define your private strategy. 
> They are loaded as CRE secrets and stay inside the TEE — they never appear on-chain or in logs.

### Simulate locally

From the **project root** (where `project.yaml` is):

```bash
cre workflow simulate automated-liquidation-protection-workflow --target staging-settings --non-interactive --trigger-index 0
```

The simulator runs one cron tick locally, reads your position from Sepolia, and logs the decision. No transaction is broadcast during simulation.

### Simulate sending transactions

From the **project root** (where `project.yaml` is):

```bash
cre workflow simulate automated-liquidation-protection-workflow --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

`--broadcast` makes the simulator execute a real onchain write transaction, and can update your position.

### Deploy the workflow

Deployment takes 3 steps:
1. add the secret to the Vault DON
2. deploy
3. verify

#### Get the Deploy Access

**Requires Early Access approval!**

Fill this [form](https://docs.google.com/forms/d/e/1FAIpQLSdk8mxDZAXpEX1PHgjzCoBeKxSoQysoO9sxOb-gpBrDrjOhtA/viewform) and wait 24h during the hackathon period.

#### Private Registry

We'll use the **private registry** (authorized by your CRE login session — no wallet, no gas).

The [private registry](https://docs.chain.link/cre/guides/operations/deploying-to-private-registry-ts) is a Chainlink-hosted, offchain workflow registry.

All lifecycle operations (deploy, activate, pause, delete, update) are authorized by your CRE login session.
You do not need to settup a wallet and there are no Ethereum Mainnet transactions and no gas fees for registry management.

#### Step 1: Add the Secret to the Vault DON (Before Deploying!)

A deployed workflow **cannot read your local `.env` file** — it fetches secrets from the Vault DON at runtime.

Before deploying, you must store the secrets in the Vault DON. Execute the secret creation:


```bash
cre secrets create secrets.yaml --target staging-settings --secrets-auth=browser
```

> **Alert** Make sure `CRE_ETH_PRIVATE_KEY` is set in your `.env` before executing the command above!


The CLI reads `secrets.yaml`, get the names and picks up the values in `.env`, opens a browser window to authorize against the Vault DON with your CRE login session, and stores the secret. 

Verify it landed (only the ID is shown, never the value):

```bash
cre secrets list --target staging-settings --secrets-auth=browser
```

> **Note**: In a Confidential Workflow, the Vault DON releases this secret **only into an attested enclave** at the moment `getSecret()` runs — it is never exposed in plaintext to Workflow DON nodes.


#### Step 2: Deploy

Verify if the configuration file `workflow.yaml` is already prepared for deployment.

Go to `staging-settings`, `user-workflow`.

Add or update `deployment-registry: "private"`:

```yaml
staging-settings:
  user-workflow:
    workflow-name: "hello-confidential-staging"
    deployment-registry: "private"
```

Then **deploy** from the project root:

```bash
cre workflow deploy automated-liquidation-protection-workflow --target staging-settings
```

The CLI compiles the workflow to WASM, uploads the artifacts, and registers the workflow — active immediately.

#### Step 3: Verify and Manage

Confirm it's registered and active:

```bash
cre workflow list --registry private
```

You can also check it out on [CRE workflows](https://app.chain.link/cre/workflows)

#### Manage your workflow


```bash
cre workflow pause my-workflow --target staging-settings     # pause
cre workflow activate my-workflow --target staging-settings  # resume
cre workflow delete my-workflow --target staging-settings    # permanently remove
```

The workflow now runs on its CRON schedule: every execution happens inside a real enclave, fetches the secrets from the Vault DON, and produces a DON-signed report.

> ⚠️ **Production reminder**: check if the template has logs exposing secret values inside the enclave for debugging. Remove every `runtime.log()` inside the TEE handler before any real deployment — anything logged from within a Confidential Workflow could leak the data the enclave is meant to protect.

## Have fun!
