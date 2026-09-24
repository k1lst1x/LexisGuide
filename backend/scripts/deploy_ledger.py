"""Create a recorder wallet, or deploy the DocumentLedger contract.

    # 1. Make the wallet the API signs with. Keep the printed key secret.
    python scripts/deploy_ledger.py new-wallet

    # 2. Fund that address from a Base Sepolia faucet, then deploy:
    LEDGER_PRIVATE_KEY=0x... python scripts/deploy_ledger.py deploy

The deploying wallet becomes the contract owner (it can rotate the recorder)
and, unless --recorder names another address, the recorder too. Run from the
backend directory with its virtualenv active.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from eth_account import Account
from web3 import Web3

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ledger import ARTIFACT, DEFAULT_CHAIN_ID, DEFAULT_RPC_URL, NETWORKS  # noqa: E402


def new_wallet() -> None:
    account = Account.create()
    print(f"Address:     {account.address}")
    print(f"Private key: {account.key.hex()}")
    print("\nStore the key in Secrets Manager, never in Git or a frontend variable.")


def deploy(rpc_url: str, chain_id: int, recorder: str | None) -> None:
    key = os.getenv("LEDGER_PRIVATE_KEY", "").strip()
    if not key:
        sys.exit("Set LEDGER_PRIVATE_KEY to the deploying wallet's key.")
    web3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 20}))
    if web3.eth.chain_id != chain_id:
        sys.exit(f"{rpc_url} is chain {web3.eth.chain_id}, not {chain_id}.")

    account = Account.from_key(key)
    balance = web3.eth.get_balance(account.address)
    if balance == 0:
        sys.exit(f"{account.address} has no ETH on chain {chain_id}. Fund it from a faucet first.")

    artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    recorder = Web3.to_checksum_address(recorder or account.address)
    transaction = factory.constructor(recorder).build_transaction(
        {
            "from": account.address,
            "chainId": chain_id,
            "nonce": web3.eth.get_transaction_count(account.address, "pending"),
        }
    )
    signed = account.sign_transaction(transaction)
    tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"Deploying… {tx_hash.to_0x_hex()}")
    receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    if receipt["status"] != 1:
        sys.exit("The deployment reverted.")

    explorer = NETWORKS.get(chain_id, {}).get("explorer", "")
    address = receipt["contractAddress"]
    print(f"\nDocumentLedger deployed at {address} (block {receipt['blockNumber']})")
    print(f"Owner and deployer: {account.address}")
    print(f"Recorder:           {recorder}")
    if explorer:
        print(f"Explorer:           {explorer}/address/{address}")
    print(f"\nSet the GitHub variable LEDGER_CONTRACT_ADDRESS={address}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("new-wallet", help="Generate a recorder wallet.")
    deploy_parser = commands.add_parser("deploy", help="Deploy DocumentLedger.")
    deploy_parser.add_argument("--rpc-url", default=os.getenv("LEDGER_RPC_URL") or DEFAULT_RPC_URL)
    deploy_parser.add_argument(
        "--chain-id", type=int, default=int(os.getenv("LEDGER_CHAIN_ID") or DEFAULT_CHAIN_ID)
    )
    deploy_parser.add_argument("--recorder", help="Recorder address, if not the deployer.")
    args = parser.parse_args()
    if args.command == "new-wallet":
        new_wallet()
    else:
        deploy(args.rpc_url, args.chain_id, args.recorder)


if __name__ == "__main__":
    main()
