"""Move document changes from pending to confirmed on chain.

``settle`` is the only thing that signs, and it runs only while holding the
ledger writer lease, so the recorder wallet's nonces never collide. It is safe
to run again at any point: every transaction tried for a change is stored
before it is broadcast, and the contract refuses a change id it has already
recorded.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import uuid4

from app.ledger import Anchored, Ledger, LedgerError, configured_ledger, document_key
from app.storage import (
    acquire_ledger_writer,
    consume_ledger_quota,
    create_ledger_change,
    list_ledger_changes,
    release_remote_operation,
    update_ledger_change,
)

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5


@contextmanager
def ledger_writer(wait_seconds: float) -> Iterator[bool]:
    """Hold the writer lease, waiting up to ``wait_seconds`` for it. Yields
    False when another request kept it; the change stays pending and the next
    history read picks it up."""
    deadline = time.monotonic() + wait_seconds
    lease = acquire_ledger_writer()
    while lease is None and time.monotonic() < deadline:
        time.sleep(0.4)
        lease = acquire_ledger_writer()
    try:
        yield lease is not None
    finally:
        if lease is not None:
            release_remote_operation(lease)


def record_shared_version(
    workspace_id: str, user: dict[str, str], document_id: str, text: str, title: str
) -> None:
    """Add a shared document's new text to its workspace history.

    The change is stored pending with its text; the next history read writes it
    to the chain. Sharing the same text again records nothing. Best-effort: a
    history problem never stops the share itself.
    """
    try:
        if configured_ledger() is None or not consume_ledger_quota(user["sub"]):
            return
        owner = f"workspace:{workspace_id}"
        key = document_key(owner, document_id)
        content_hash = sha256(text.encode()).hexdigest()
        earlier = list_ledger_changes(owner, key)
        if earlier and earlier[-1]["content_hash"] == content_hash:
            return
        create_ledger_change(
            owner,
            key,
            {
                "change_id": str(uuid4()),
                "document_id": document_id,
                "kind": "edited" if earlier else "created",
                "content_hash": content_hash,
                "title": title,
                "text": text,
                "changed_by": user.get("name") or user.get("email") or "",
            },
        )
    except Exception as error:  # noqa: BLE001 - history is best-effort
        logger.warning("Shared version of %s was not recorded: %s", document_id, error)


def _confirm(user_id: str, row: dict[str, Any], anchored: Anchored) -> dict[str, Any]:
    fields = {
        "status": "confirmed",
        "tx_hash": anchored.tx_hash,
        "block_number": anchored.block_number,
        "block_time": anchored.block_time,
        "sequence": anchored.sequence,
        "entry_hash": anchored.entry_hash,
        "previous_entry": anchored.previous_entry,
        "confirmed_at": datetime.now(UTC).isoformat(),
        "error": "",
    }
    update_ledger_change(user_id, row["sort_key"], fields)
    return {**row, **fields}


def _fail(user_id: str, row: dict[str, Any], message: str) -> dict[str, Any]:
    fields = {"status": "failed", "error": message}
    update_ledger_change(user_id, row["sort_key"], fields)
    return {**row, **fields}


def settle(
    ledger: Ledger, user_id: str, row: dict[str, Any], wait_seconds: float
) -> dict[str, Any]:
    """Advance one pending change as far as it will go right now."""
    if row.get("status") != "pending":
        return row
    tx_hashes: list[str] = list(row.get("tx_hashes") or [])
    try:
        # An earlier send may already be mined; newest first.
        for tx_hash in reversed(tx_hashes):
            anchored = ledger.wait(tx_hash, timeout=0)
            if anchored:
                return _confirm(user_id, row, anchored)

        # Still in the mempool: wait for it rather than sending a duplicate.
        if tx_hashes and ledger.is_known(tx_hashes[-1]):
            anchored = ledger.wait(tx_hashes[-1], timeout=wait_seconds)
            return _confirm(user_id, row, anchored) if anchored else row

        if int(row.get("attempts", 0)) >= MAX_ATTEMPTS:
            return _fail(user_id, row, "The change could not be recorded after several attempts.")

        tx_hash, raw = ledger.sign(
            user_id, row["document_id"], row["change_id"], row["content_hash"], row["kind"]
        )
        tx_hashes.append(tx_hash)
        sent = {
            "tx_hashes": tx_hashes,
            "tx_hash": tx_hash,
            "attempts": int(row.get("attempts", 0)) + 1,
            "last_sent_at": datetime.now(UTC).isoformat(),
        }
        # Stored before broadcasting, so this send can always be found again.
        update_ledger_change(user_id, row["sort_key"], sent)
        row = {**row, **sent}
        ledger.broadcast(raw)

        anchored = ledger.wait(tx_hash, timeout=wait_seconds)
        return _confirm(user_id, row, anchored) if anchored else row
    except LedgerError as error:
        return _fail(user_id, row, str(error))
    except Exception as error:  # noqa: BLE001 - an RPC outage must leave the change pending.
        logger.warning("Ledger change %s is still pending: %s", row.get("change_id"), error)
        update_ledger_change(user_id, row["sort_key"], {"error": "Waiting for the network."})
        return {**row, "error": "Waiting for the network."}
