"""Write document changes to the DocumentLedger contract on Base.

Each change is one transaction from the API's recorder wallet; the contract
links it into that document's hash chain. Only fingerprints go on chain: an
opaque document key, the SHA-256 of the text, and the kind of change.

The ledger is optional, like the other external integrations. With no
``LEDGER_CONTRACT_ADDRESS`` configured, ``configured_ledger()`` returns None
and the API reports the ledger as off rather than pretending to record.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Any

import boto3

KINDS = {"created": 1, "reviewed": 2, "edited": 3, "rewrite_applied": 4, "renamed": 5}
KIND_NAMES = {number: name for name, number in KINDS.items()}

NETWORKS = {
    84532: {"name": "Base Sepolia", "explorer": "https://sepolia.basescan.org"},
    8453: {"name": "Base", "explorer": "https://basescan.org"},
}
DEFAULT_CHAIN_ID = 84532
DEFAULT_RPC_URL = "https://sepolia.base.org"
# Long enough for Base's two-second blocks under load, short enough that the
# API answers well inside its 29-second Lambda timeout.
RECEIPT_TIMEOUT_SECONDS = 15
ARTIFACT = Path(__file__).with_name("ledger_contract.json")


class LedgerError(RuntimeError):
    pass


@dataclass(frozen=True)
class Anchored:
    """Where one change landed on chain."""

    tx_hash: str
    block_number: int
    block_time: int
    sequence: int
    entry_hash: str
    previous_entry: str


def document_key(user_id: str, document_id: str) -> str:
    """The on-chain name for one person's document.

    Document ids can contain file names, so they never go on chain as they are.
    Hashing them with the owner's id gives each document a stable key that
    reveals neither.
    """
    return "0x" + sha256(f"lexisguide:document:{user_id}:{document_id}".encode()).hexdigest()


def change_key(change_id: str) -> str:
    return "0x" + sha256(f"lexisguide:change:{change_id}".encode()).hexdigest()


def _hex32(value: bytes | str) -> str:
    if isinstance(value, bytes):
        return "0x" + value.hex()
    return value if value.startswith("0x") else "0x" + value


def _private_key() -> str:
    key = os.getenv("LEDGER_PRIVATE_KEY", "").strip()
    if key:
        return key
    arn = os.getenv("LEDGER_PRIVATE_KEY_SECRET_ARN", "").strip()
    if not arn:
        raise LedgerError("No recorder key is configured.")
    secret = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION")).get_secret_value(
        SecretId=arn
    )["SecretString"]
    try:
        parsed = json.loads(secret)
    except json.JSONDecodeError:
        return secret.strip()
    return str(parsed.get("private_key", "")).strip()


class Ledger:
    def __init__(self, web3: Any, contract_address: str, private_key: str, chain_id: int) -> None:
        from eth_account import Account

        self.web3 = web3
        self.chain_id = chain_id
        artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        self.contract = web3.eth.contract(
            address=web3.to_checksum_address(contract_address), abi=artifact["abi"]
        )
        self.account = Account.from_key(private_key)

    @property
    def network(self) -> dict[str, Any]:
        known = NETWORKS.get(self.chain_id, {"name": f"Chain {self.chain_id}", "explorer": ""})
        return {
            "chain_id": self.chain_id,
            "network": known["name"],
            "explorer_url": known["explorer"],
            "contract_address": self.contract.address,
            "recorder_address": self.account.address,
        }

    def is_recorded(self, change_id: str) -> bool:
        return bool(self.contract.functions.recorded(change_key(change_id)).call())

    def sign(
        self, user_id: str, document_id: str, change_id: str, content_hash: str, kind: str
    ) -> tuple[str, bytes]:
        """Build and sign one record() call without sending it.

        The transaction hash is known once it is signed, so the caller stores
        it before broadcasting. A send whose outcome is lost is then always
        recoverable from its receipt, with no log search needed.
        """
        call = self.contract.functions.record(
            document_key(user_id, document_id),
            change_key(change_id),
            _hex32(content_hash),
            KINDS[kind],
        )
        from web3.exceptions import ContractCustomError, ContractLogicError

        sender = self.account.address
        try:
            transaction = call.build_transaction(
                {
                    "from": sender,
                    "chainId": self.chain_id,
                    # "pending" counts transactions still in the mempool, so a
                    # retry after a timeout does not reuse a nonce.
                    "nonce": self.web3.eth.get_transaction_count(sender, "pending"),
                }
            )
        except (ContractCustomError, ContractLogicError) as error:
            # Gas estimation runs the call; a revert here is the contract's
            # final answer (wrong recorder, repeated change), not an outage.
            raise LedgerError("The ledger contract refused this change.") from error
        signed = self.account.sign_transaction(transaction)
        return _hex32(signed.hash), signed.raw_transaction

    def broadcast(self, raw_transaction: bytes) -> None:
        self.web3.eth.send_raw_transaction(raw_transaction)

    def is_known(self, tx_hash: str) -> bool:
        """Whether the network still holds this transaction, mined or pending."""
        from web3.exceptions import TransactionNotFound

        try:
            self.web3.eth.get_transaction(tx_hash)
        except TransactionNotFound:
            return False
        return True

    def wait(self, tx_hash: str, timeout: float = RECEIPT_TIMEOUT_SECONDS) -> Anchored | None:
        """The anchored change once its block is mined, or None if not yet."""
        from web3.exceptions import TimeExhausted, TransactionNotFound

        try:
            if timeout:
                receipt = self.web3.eth.wait_for_transaction_receipt(
                    tx_hash, timeout=timeout, poll_latency=0.5
                )
            else:
                receipt = self.web3.eth.get_transaction_receipt(tx_hash)
        except (TimeExhausted, TransactionNotFound):
            return None
        if receipt["status"] != 1:
            raise LedgerError(f"Transaction {tx_hash} reverted.")
        return self._anchored(receipt)

    def _anchored(self, receipt: Any) -> Anchored:
        events = self.contract.events.DocumentChanged().process_receipt(receipt)
        if not events:
            raise LedgerError("The transaction recorded no document change.")
        args = events[0]["args"]
        block = self.web3.eth.get_block(receipt["blockNumber"])
        return Anchored(
            tx_hash=_hex32(receipt["transactionHash"]),
            block_number=int(receipt["blockNumber"]),
            block_time=int(block["timestamp"]),
            sequence=int(args["sequence"]),
            entry_hash=_hex32(args["entryHash"]),
            previous_entry=_hex32(args["previousEntry"]),
        )


@lru_cache
def configured_ledger() -> Ledger | None:
    address = os.getenv("LEDGER_CONTRACT_ADDRESS", "").strip()
    if not address:
        return None
    from web3 import Web3

    rpc_url = os.getenv("LEDGER_RPC_URL", "").strip() or DEFAULT_RPC_URL
    chain_id = int(os.getenv("LEDGER_CHAIN_ID", "") or DEFAULT_CHAIN_ID)
    web3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))
    return Ledger(web3, address, _private_key(), chain_id)
