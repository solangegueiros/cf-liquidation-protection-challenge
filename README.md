# Automated Liquidation Protection Challenge 
# using CRE Confidential Workflows


Tokens ERC20 (Ethereum Sepolia):
- virtual ETH - vETH - [0x89F0DF6D4629D494D599E03505C323537C24667a](https://sepolia.etherscan.io/address/0x89F0DF6D4629D494D599E03505C323537C24667a)
- virtual USD - vUSD - [0xC96c007023Ae2a23D097D5D95d4b91D6a501Da0b](https://sepolia.etherscan.io/address/0xC96c007023Ae2a23D097D5D95d4b91D6a501Da0b)

The Lending and Borrowing / Liquidation Smart Contract Challenge address (Ethereum Sepolia):
[0x59d5B29FbA5ca865a171076BE94EbEeC5BCA1E04](https://sepolia.etherscan.io/address/0x59d5B29FbA5ca865a171076BE94EbEeC5BCA1E04)

# The challenge

Build a Confidential Workflow that protects a virtual ETH-collateral/vUSD-debt position during simulated market movements.

The workflow must:

* Avoid liquidation.  
* Preserve the benefit of keeping the loan open.  
* Use emergency capital efficiently.  
* Keep sensitive protection rules and credentials private.

## How to do it

You can create and deploy your workflow until the hackathon submission deadline.

Fork this repo and do local simulations, or even test your workflow yourself, deploying a personal challenge smart contract / tokens.

Until the hackathon submission deadline, update your workflow to join the official challenge, using the smart contract addresses defined on this readme file.

Use the function `join()` to join the challenge in the official smart contract.

> Join from Sept 8 to hackathon submission deadline.

After the deadline, Chainlink team will run the scenarios, during the next 24h and discover the winner.

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
