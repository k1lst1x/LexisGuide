// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title LexisGuide document ledger
/// @notice An append-only history of document changes. Each change is one
/// transaction, and each document's entries form a hash chain: every entry
/// commits to the one before it, so no step can be removed or reordered
/// without breaking every later entry.
///
/// Only fingerprints are stored. `documentKey` is an opaque hash chosen by the
/// LexisGuide API; `contentHash` is the SHA-256 of the document text. No text,
/// title, or account detail ever reaches the chain.
contract DocumentLedger {
    /// The change kinds the API records. Stored as a uint8 on chain.
    uint8 public constant KIND_CREATED = 1;
    uint8 public constant KIND_REVIEWED = 2;
    uint8 public constant KIND_EDITED = 3;
    uint8 public constant KIND_REWRITE_APPLIED = 4;
    uint8 public constant KIND_RENAMED = 5;

    struct Head {
        uint64 count;
        bytes32 latestEntry;
    }

    event DocumentChanged(
        bytes32 indexed documentKey,
        bytes32 indexed changeId,
        uint64 sequence,
        uint8 kind,
        bytes32 contentHash,
        bytes32 previousEntry,
        bytes32 entryHash
    );
    event RecorderChanged(address indexed previousRecorder, address indexed newRecorder);

    error NotOwner();
    error NotRecorder();
    error AlreadyRecorded(bytes32 changeId);
    error InvalidKind(uint8 kind);
    error ZeroAddress();

    address public immutable owner;
    /// The API's signing wallet. Only it may append, so nobody else can write
    /// history under a LexisGuide document key.
    address public recorder;

    mapping(bytes32 documentKey => Head) public heads;
    /// Makes a retried submission harmless: a change id is recorded once.
    mapping(bytes32 changeId => bool) public recorded;

    constructor(address recorder_) {
        if (recorder_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        recorder = recorder_;
        emit RecorderChanged(address(0), recorder_);
    }

    /// @notice Rotate the API's signing wallet, e.g. if its key is exposed.
    function setRecorder(address newRecorder) external {
        if (msg.sender != owner) revert NotOwner();
        if (newRecorder == address(0)) revert ZeroAddress();
        emit RecorderChanged(recorder, newRecorder);
        recorder = newRecorder;
    }

    /// @notice Append one change to a document's history.
    /// @return sequence The change's position in this document's history, from 1.
    /// @return entryHash The new head of the document's hash chain.
    function record(bytes32 documentKey, bytes32 changeId, bytes32 contentHash, uint8 kind)
        external
        returns (uint64 sequence, bytes32 entryHash)
    {
        if (msg.sender != recorder) revert NotRecorder();
        if (recorded[changeId]) revert AlreadyRecorded(changeId);
        if (kind < KIND_CREATED || kind > KIND_RENAMED) revert InvalidKind(kind);

        Head storage head = heads[documentKey];
        bytes32 previousEntry = head.latestEntry;
        sequence = head.count + 1;
        entryHash = entryHashOf(documentKey, changeId, sequence, kind, contentHash, previousEntry);

        head.count = sequence;
        head.latestEntry = entryHash;
        recorded[changeId] = true;

        emit DocumentChanged(documentKey, changeId, sequence, kind, contentHash, previousEntry, entryHash);
    }

    /// @notice Recompute an entry hash, so anyone can check a chain of events off-chain.
    function entryHashOf(
        bytes32 documentKey,
        bytes32 changeId,
        uint64 sequence,
        uint8 kind,
        bytes32 contentHash,
        bytes32 previousEntry
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(documentKey, changeId, sequence, kind, contentHash, previousEntry));
    }
}
