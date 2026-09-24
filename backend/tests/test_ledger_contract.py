"""The DocumentLedger contract and its client, on an in-memory EVM.

These run the compiled bytecode the API ships, so they check the real
contract: the per-document hash chain, one-time change ids, and that only the
recorder wallet can write.
"""

import json
from ast import literal_eval
from contextlib import contextmanager
from hashlib import sha256

import pytest

pytest.importorskip("eth_tester")

from eth_tester import EthereumTester, PyEVMBackend  # noqa: E402
from eth_tester.exceptions import TransactionFailed  # noqa: E402
from web3 import Web3  # noqa: E402
from web3.exceptions import ContractCustomError  # noqa: E402

from app import ledger  # noqa: E402

ARTIFACT = json.loads(ledger.ARTIFACT.read_text(encoding="utf-8"))


@contextmanager
def reverts_with(error: str):
    """Expect a revert carrying this custom error, however the provider reports it."""
    selector = Web3.keccak(text=error)[:4]
    with pytest.raises((ContractCustomError, TransactionFailed, ledger.LedgerError)) as raised:
        yield
    # The client wraps a real node's revert in LedgerError; the cause carries the data.
    error = raised.value.__cause__ if isinstance(raised.value, ledger.LedgerError) else raised.value
    data = getattr(error, "data", None)
    if isinstance(data, str):
        data = bytes.fromhex(data.removeprefix("0x"))
    if data is None:
        # eth-tester puts the raw revert bytes in its message.
        reported = str(error).split(": ", 1)[1]
        data = literal_eval(reported) if reported.startswith("b") else bytes.fromhex(reported[2:])
    assert bytes(data[:4]) == bytes(selector), f"expected {error}, got {data!r}"


def content_hash(text: str) -> str:
    return sha256(text.encode()).hexdigest()


@pytest.fixture
def chain() -> tuple[Web3, list[str]]:
    backend = PyEVMBackend()
    web3 = Web3(Web3.EthereumTesterProvider(EthereumTester(backend)))
    keys = [key.to_hex() for key in backend.account_keys]
    return web3, keys


@pytest.fixture
def deployed(chain: tuple[Web3, list[str]]) -> tuple[Web3, ledger.Ledger, list[str]]:
    web3, keys = chain
    owner, recorder = web3.eth.accounts[0], web3.eth.accounts[1]
    factory = web3.eth.contract(abi=ARTIFACT["abi"], bytecode=ARTIFACT["bytecode"])
    receipt = web3.eth.wait_for_transaction_receipt(
        factory.constructor(recorder).transact({"from": owner})
    )
    client = ledger.Ledger(web3, receipt["contractAddress"], keys[1], web3.eth.chain_id)
    return web3, client, keys


def anchor(client: ledger.Ledger, user: str, document: str, change: str, text: str, kind: str):
    tx_hash, raw = client.sign(user, document, change, content_hash(text), kind)
    client.broadcast(raw)
    anchored = client.wait(tx_hash)
    assert anchored is not None
    assert anchored.tx_hash == tx_hash
    return anchored


def test_each_change_extends_its_documents_hash_chain(deployed) -> None:
    _, client, _ = deployed

    first = anchor(client, "ada", "lease", "c1", "Draft", "created")
    second = anchor(client, "ada", "lease", "c2", "Draft, revised", "edited")
    other = anchor(client, "ada", "notice", "c3", "Other", "created")

    assert (first.sequence, second.sequence, other.sequence) == (1, 2, 1)
    assert first.previous_entry == "0x" + "00" * 32
    assert second.previous_entry == first.entry_hash
    assert other.previous_entry == "0x" + "00" * 32
    assert second.block_number > first.block_number


def test_an_entry_hash_can_be_recomputed_from_its_parts(deployed) -> None:
    """Anyone can check the chain off-line from the event data alone."""
    web3, client, _ = deployed
    anchored = anchor(client, "ada", "lease", "c1", "Draft", "created")

    expected = Web3.keccak(
        web3.codec.encode(
            ["bytes32", "bytes32", "uint64", "uint8", "bytes32", "bytes32"],
            [
                bytes.fromhex(ledger.document_key("ada", "lease")[2:]),
                bytes.fromhex(ledger.change_key("c1")[2:]),
                1,
                1,
                bytes.fromhex(content_hash("Draft")),
                b"\0" * 32,
            ],
        )
    )
    assert anchored.entry_hash == "0x" + expected.hex().removeprefix("0x")


def test_a_change_is_recorded_once_however_often_it_is_sent(deployed) -> None:
    _, client, _ = deployed
    anchor(client, "ada", "lease", "c1", "Draft", "created")
    assert client.is_recorded("c1")

    with reverts_with("AlreadyRecorded(bytes32)"):
        client.sign("ada", "lease", "c1", content_hash("Draft"), "created")


def test_only_the_recorder_can_write(deployed) -> None:
    web3, client, keys = deployed
    intruder = ledger.Ledger(web3, client.contract.address, keys[2], web3.eth.chain_id)

    with reverts_with("NotRecorder()"):
        intruder.sign("ada", "lease", "forged", content_hash("Forged"), "edited")


def test_the_owner_can_rotate_the_recorder_and_nobody_else_can(deployed) -> None:
    web3, client, keys = deployed
    owner, stranger, replacement = web3.eth.accounts[0], web3.eth.accounts[2], web3.eth.accounts[3]

    with reverts_with("NotOwner()"):
        client.contract.functions.setRecorder(stranger).transact({"from": stranger})

    client.contract.functions.setRecorder(replacement).transact({"from": owner})
    rotated = ledger.Ledger(web3, client.contract.address, keys[3], web3.eth.chain_id)
    assert anchor(rotated, "ada", "lease", "c9", "Draft", "created").sequence == 1
    with reverts_with("NotRecorder()"):
        client.sign("ada", "lease", "c10", content_hash("Draft"), "edited")


def test_keys_on_chain_reveal_neither_the_person_nor_the_file_name() -> None:
    key = ledger.document_key("user-123", "upload-Divorce settlement.pdf-1700000000-2048")
    assert "Divorce" not in key and "user-123" not in key
    assert key == ledger.document_key("user-123", "upload-Divorce settlement.pdf-1700000000-2048")
    assert key != ledger.document_key("user-456", "upload-Divorce settlement.pdf-1700000000-2048")
