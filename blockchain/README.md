# Document ledger

Every change to a document someone adds to LexisGuide is written to the
`DocumentLedger` contract on Base Sepolia, one transaction per change. The
Activity page shows each document's history block by block, live, with links to
BaseScan.

## What goes on chain

Only fingerprints. Each entry holds:

- `documentKey`: SHA-256 of the owner's user id and the document id. It reveals
  neither the person nor the file name.
- `changeId`: a one-time id, so a retried request can never record twice.
- `contentHash`: SHA-256 of the document text, computed in the browser. The
  text itself never leaves the browser for this.
- `kind`: `1` added, `2` AI review, `3` edited, `4` rewrite applied, `5` renamed.

Entries form a hash chain per document. `entryHash` is
`keccak256(abi.encode(documentKey, changeId, sequence, kind, contentHash, previousEntry))`,
so no entry can be removed or reordered without breaking every later one. Anyone
can recompute it from the `DocumentChanged` events, or call `entryHashOf` on the
contract.

To check that a copy of a document is the one recorded, hash its text with
SHA-256 and compare it to the entry's `contentHash`. The Activity page does this
for the text on screen.

## How a change is recorded

1. The browser sends `POST /api/v1/ledger/changes` with the fingerprint.
2. The API stores the change as `pending`, takes the single ledger-writer lease
   (so the recorder wallet's nonces never collide), signs the transaction,
   stores its hash, broadcasts it, and waits up to 12 s for the block.
3. The browser shows the change as pending straight away and polls every 2.5 s
   until its block number arrives.
4. A change still pending after that, for example after an RPC outage, is picked
   up by the next history read: a mined transaction is confirmed, and one the
   network dropped is re-sent. The contract refuses a change id it already has.

Typing is recorded as one edit once it pauses for 3 s. The sample documents
built into the workspace are never recorded.

## Setting it up

You need Python with the backend dependencies (`backend/.venv`) and the AWS CLI.

1. **Create the recorder wallet.** It signs every transaction:

   ```bash
   cd backend
   python scripts/deploy_ledger.py new-wallet
   ```

   Keep the printed private key secret. It never goes in Git or a `VITE_`
   variable.

2. **Fund it** with Base Sepolia test ETH from a faucet (for example
   https://www.alchemy.com/faucets/base-sepolia or the Coinbase Developer
   Platform faucet). One change costs a tiny fraction of the test ETH a faucet
   gives, so 0.05 ETH records thousands of changes.

3. **Deploy the contract** with that wallet. It becomes both owner and recorder:

   ```bash
   LEDGER_PRIVATE_KEY=0x... python scripts/deploy_ledger.py deploy
   ```

   The script prints the contract address and its BaseScan link.

4. **Store the key in Secrets Manager**, in the same region as the API:

   ```bash
   aws secretsmanager create-secret --name lexisguide/ledger-recorder-key \
     --secret-string '{"private_key":"0x..."}'
   ```

5. **Set the GitHub Actions variables**, then push or re-run
   **Deploy production API**:

   - `LEDGER_CONTRACT_ADDRESS`: the deployed address
   - `LEDGER_PRIVATE_KEY_SECRET_ARN`: the secret's ARN
   - `LEDGER_RPC_URL` (optional): an Alchemy, QuickNode, or Coinbase node URL.
     The default public `https://sepolia.base.org` is rate limited and
     not meant for production traffic.
   - `LEDGER_CHAIN_ID` (optional): defaults to `84532`, Base Sepolia.

With no contract address set, the ledger stays off: the API reports it
disabled, and the Activity page says so instead of showing history.

For local development, put `LEDGER_CONTRACT_ADDRESS` and `LEDGER_PRIVATE_KEY`
in `backend/.env`.

## Moving to Base mainnet

Deploy again with `--rpc-url https://mainnet.base.org --chain-id 8453` and a
wallet holding real ETH. Then set `LEDGER_CHAIN_ID=8453`, a mainnet
`LEDGER_RPC_URL`, and the new address. Each change then costs real ETH (a
fraction of a cent on Base), so watch the recorder wallet's balance.

## If the key leaks

The contract owner can hand recording to a new wallet with
`setRecorder(newAddress)`. Existing history is unaffected. Then replace the
secret and redeploy the API.

## Changing the contract

```bash
cd blockchain
npm ci
npm run compile   # writes backend/app/ledger_contract.json
```

The backend tests run the compiled bytecode on an in-memory EVM
(`backend/tests/test_ledger_contract.py`, `test_ledger_routes.py`). A changed
contract needs a fresh deployment and a new `LEDGER_CONTRACT_ADDRESS`. The
old contract keeps its history, but the app reads only from the new one.
