// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {V3SecurityFixture, V3SecurityHarness, V3SecurityEdgeHarness} from "test/helpers/V3SecurityFixture.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {AccountV3Types as T} from "src/v3/AccountV3Types.sol";
import {AccountV3Policy as P} from "src/v3/AccountV3Policy.sol";
import {AccountV3Storage as D} from "src/v3/AccountV3Storage.sol";
import {AccountV3Signatures as S} from "src/v3/AccountV3Signatures.sol";
import {AccountV3Enrollment as E} from "src/v3/AccountV3Enrollment.sol";
import {AccountV3Security as Security} from "src/v3/AccountV3Security.sol";
import {AccountV3WebAuthnVerifier} from "src/v3/AccountV3WebAuthnVerifier.sol";
import {V3TestContractSigner} from "test/AccountV3Signatures.t.sol";

contract AccountV3SecurityTest is V3SecurityFixture {
    V3SecurityEdgeHarness private account;
    T.SecurityPolicy private next;

    function setUp() public {
        _setupKeys();
        vm.warp(1_000_000);
        vm.chainId(31337);
        account = new V3SecurityEdgeHarness(_policy(alice, bob), keccak256(abi.encode(_chains())));
        next = _policy(alice, carol);
    }

    function test_prepareAndFreshCommitInstallPolicyAndChainManifestExactlyOnce() public {
        V3SecurityHarness.Snapshot memory before_ = account.snapshot();
        bytes32 proposal = _prepare(account, next, E.ChangeKind.Security);
        V3SecurityHarness.Snapshot memory prepared = account.snapshot();
        assertEq(prepared.admin, 1);
        assertEq(prepared.recovery, 0);
        assertEq(prepared.version, 1);
        assertEq(prepared.manifest, before_.manifest);
        assertEq(T.hashPolicy(prepared.policy), T.hashPolicy(before_.policy));
        assertEq(T.hashPolicy(prepared.pending.nextPolicy), T.hashPolicy(next));
        assertEq(prepared.pending.proposalHash, proposal);
        assertEq(prepared.pending.readyAt, block.timestamp);
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth =
            _votes(prepared.policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN);
        account.commit(message, auth);
        V3SecurityHarness.Snapshot memory installed = account.snapshot();
        assertEq(installed.admin, 2);
        assertEq(installed.version, 2);
        assertEq(installed.id, before_.id);
        assertEq(T.hashPolicy(installed.policy), T.hashPolicy(next));
        assertEq(
            installed.manifest,
            T.hashManifest(T.SecurityManifest(before_.id, 3, 2, before_.manifest, T.hashPolicy(next), installed.scope))
        );
        _assertEmpty(installed.pending);
        _rejected(abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__StaleVersion.selector);
    }

    function testFuzz_freshCommitRemainsPossibleAfterShortAcceptanceExpires(uint48 delay) public {
        delay = SafeCast.toUint48(bound(delay, 5 minutes, 7 days - 1));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        bytes32 proposal = _prepare(account, next, E.ChangeKind.Security);
        assertEq(account.snapshot().pending.validUntil, change.proposalValidUntil);
        vm.warp(uint256(change.validAfter) + delay);
        assertGe(block.timestamp, change.validUntil);
        T.CommitProposal memory commit = _commitMessage(account);
        assertEq(commit.proposalHash, proposal);
        assertLe(commit.validUntil - commit.validAfter, 5 minutes);
        _commit(account);
        assertEq(account.snapshot().version, 2);
        account.spendEnabled();
    }

    function test_laterProposalDeadlineDoesNotExtendPrepareAuthorization() public {
        bytes memory data = _prepareData(E.ChangeKind.Security, next);
        vm.warp(block.timestamp + 5 minutes);
        _rejected(data, Security.AccountV3Security__OutsideValidity.selector);
        assertEq(account.snapshot().admin, 0);
        _assertEmpty(account.snapshot().pending);
    }

    function test_proposalDeadlineCannotChangeWithoutNewOwnerAndEnrollmentSignatures() public {
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Security), P.ADMIN);
        S.Signature[] memory proofs = _proofs(account, next, change, E.ChangeKind.Security);
        --change.proposalValidUntil;
        _rejected(
            abi.encodeCall(account.prepare, (E.ChangeKind.Security, change, next, _chains(), auth, proofs)),
            Security.AccountV3Security__InvalidConsent.selector
        );
    }

    function testFuzz_rejectsUnboundedAcceptanceAndProposalLifetimes(uint48 excess) public {
        excess = SafeCast.toUint48(bound(excess, 1, 1 days));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        change.validUntil += excess;
        _rejected(
            abi.encodeCall(
                account.prepare,
                (E.ChangeKind.Security, change, next, _chains(), new S.Signature[](0), new S.Signature[](0))
            ),
            Security.AccountV3Security__OutsideValidity.selector
        );
        change = _change(account, next, E.ChangeKind.Security);
        change.proposalValidUntil += excess;
        _rejected(
            abi.encodeCall(
                account.prepare,
                (E.ChangeKind.Security, change, next, _chains(), new S.Signature[](0), new S.Signature[](0))
            ),
            Security.AccountV3Security__InvalidProposalLifetime.selector
        );
        change.proposalValidUntil = change.validUntil;
        _rejected(
            abi.encodeCall(
                account.prepare,
                (E.ChangeKind.Security, change, next, _chains(), new S.Signature[](0), new S.Signature[](0))
            ),
            Security.AccountV3Security__InvalidProposalLifetime.selector
        );
    }

    function test_commitMustBeShortAndCannotOutlivePendingProposal() public {
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        ++message.validUntil;
        _rejected(
            abi.encodeCall(account.commit, (message, new S.Signature[](0))),
            Security.AccountV3Security__OutsideValidity.selector
        );
        vm.warp(account.snapshot().pending.validUntil - 1);
        message = _commitMessage(account);
        ++message.validUntil;
        _rejected(
            abi.encodeCall(account.commit, (message, new S.Signature[](0))),
            Security.AccountV3Security__OutsideValidity.selector
        );
    }

    function test_vetoRemainsAvailableAfterPrepareAuthorizationExpires() public {
        _prepare(account, next, E.ChangeKind.Security);
        vm.warp(block.timestamp + 1 hours);
        _veto(account, _ecdsa(alice));
        _assertEmpty(account.snapshot().pending);
        assertEq(account.snapshot().admin, 1);
    }

    function test_longestRecoveryWaitDoesNotRequireLongLivedAcceptanceSignature() public {
        T.SecurityPolicy memory original = _policy(alice, bob);
        original.recoveryDelaySeconds = 30 days;
        account = new V3SecurityEdgeHarness(original, keccak256(abi.encode(_chains())));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Recovery);
        bytes32 proposal = _prepare(account, next, E.ChangeKind.Recovery);
        assertEq(change.validUntil - change.validAfter, 5 minutes);
        assertEq(account.snapshot().pending.validUntil - change.validAfter, 37 days);
        vm.warp(account.snapshot().pending.readyAt);
        account.activate(proposal);
        assertEq(account.snapshot().version, 2);
        account.spendEnabled();
    }

    function test_newSignersCannotCommitBeforeOldAuthorityInstallsThem() public {
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        bytes32 digest = T.digest(block.chainid, address(account), T.hashCommit(message));
        _rejected(
            abi.encodeCall(account.commit, (message, _votes(next, digest, P.ADMIN))),
            Security.AccountV3Security__InvalidConsent.selector
        );
        _commit(account);
        // The newly installed quorum now controls the next transition; removed Bob cannot veto it.
        _prepare(account, _policy(carol, dave), E.ChangeKind.Security);
        T.SignerDescriptor memory removed = _ecdsa(bob);
        T.VetoProposal memory veto_ = _vetoMessage(account, removed);
        _rejected(
            abi.encodeCall(
                account.veto,
                (veto_, _memberSign(removed, T.digest(block.chainid, address(account), T.hashVeto(veto_))))
            ),
            Security.AccountV3Security__NotCurrentMember.selector
        );
        _commit(account);
        assertEq(account.snapshot().version, 3);
        assertEq(account.snapshot().policy.signers.length, 2);
        assertEq(T.hashPolicy(account.snapshot().policy), T.hashPolicy(_policy(carol, dave)));
    }

    function test_recoveryPreemptsAdminButAdminAndAnotherRecoveryCannotReplaceIt() public {
        bytes32 old = _prepare(account, next, E.ChangeKind.Security);
        bytes32 recovery = _prepare(account, _policy(carol, dave), E.ChangeKind.Recovery);
        assertNotEq(old, recovery);
        assertEq(account.snapshot().admin, 1);
        assertEq(account.snapshot().recovery, 1);
        _rejected(_prepareData(E.ChangeKind.Security, next), Security.AccountV3Security__PendingProposal.selector);
        _rejected(_prepareData(E.ChangeKind.Recovery, next), Security.AccountV3Security__PendingProposal.selector);
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth = _votes(
            account.snapshot().policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN
        );
        _rejected(abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__WrongProposal.selector);
        _rejected(abi.encodeCall(account.spendEnabled, ()), Security.AccountV3Security__SpendingDisabled.selector);
        _rejected(abi.encodeCall(account.expire, (old)), Security.AccountV3Security__WrongProposal.selector);
    }

    function test_recoveryUsesOldDelayFromAcceptanceAndAnyRelayerCanActivate() public {
        T.SecurityPolicy memory original = _policy(alice, bob);
        original.recoveryDelaySeconds = 7 days;
        account = new V3SecurityEdgeHarness(original, keccak256(abi.encode(_chains())));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Recovery);
        change.validAfter -= 30;
        change.validUntil = change.validAfter + 5 minutes;
        change.proposalValidUntil -= 30;
        S.Signature[] memory auth = _votes(original, _context(account, change, E.ChangeKind.Recovery), P.RECOVERY);
        S.Signature[] memory proofs = _proofs(account, next, change, E.ChangeKind.Recovery);
        vm.warp(block.timestamp + 30);
        uint256 acceptedAt = block.timestamp;
        bytes32 hash = account.prepare(E.ChangeKind.Recovery, change, next, _chains(), auth, proofs);
        uint48 ready = account.snapshot().pending.readyAt;
        assertEq(ready, acceptedAt + 7 days);
        vm.warp(ready - 1);
        _rejected(abi.encodeCall(account.activate, (hash)), Security.AccountV3Security__ProposalNotReady.selector);
        vm.warp(ready);
        vm.prank(makeAddr("untrusted-relayer"));
        account.activate(hash);
        assertEq(account.snapshot().version, 2);
        assertEq(account.snapshot().admin, 0);
        assertEq(account.snapshot().recovery, 1);
        assertEq(account.snapshot().policy.recoveryDelaySeconds, 72 hours);
        account.spendEnabled();
        _rejected(abi.encodeCall(account.activate, (hash)), Security.AccountV3Security__WrongProposal.selector);
    }

    function test_expiredRecoveryCannotActivateAndPermissionlessCleanupDoesNotRestoreNonce() public {
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Recovery);
        bytes memory replay = _prepareData(E.ChangeKind.Recovery, next);
        bytes32 hash = _prepare(account, next, E.ChangeKind.Recovery);
        vm.warp(change.proposalValidUntil);
        _rejected(abi.encodeCall(account.activate, (hash)), Security.AccountV3Security__ProposalNotReady.selector);
        _rejected(abi.encodeCall(account.spendEnabled, ()), Security.AccountV3Security__SpendingDisabled.selector);
        vm.prank(makeAddr("cleanup-relayer"));
        account.expire(hash);
        account.spendEnabled();
        assertEq(account.snapshot().version, 1);
        assertEq(account.snapshot().recovery, 1);
        _assertEmpty(account.snapshot().pending);
        _rejected(replay, Security.AccountV3Security__OutsideValidity.selector);
    }

    function test_vetoConsumesOnlyCurrentMembersNonceAndDoesNotMakeProposalReplayable() public {
        bytes memory replay = _prepareData(E.ChangeKind.Recovery, next);
        _prepare(account, next, E.ChangeKind.Recovery);
        T.SignerDescriptor memory member = _ecdsa(bob);
        T.VetoProposal memory message = _vetoMessage(account, member);
        bytes memory signedVeto = _memberSign(member, T.digest(block.chainid, address(account), T.hashVeto(message)));
        account.veto(message, signedVeto);
        assertEq(account.vetoNonce(T.signerId(member)), 1);
        assertEq(account.vetoNonce(T.signerId(_ecdsa(alice))), 0);
        assertEq(account.snapshot().admin, 0);
        assertEq(account.snapshot().recovery, 1);
        assertEq(account.snapshot().version, 1);
        _rejected(replay, Security.AccountV3Security__WrongNonce.selector);
        _prepare(account, next, E.ChangeKind.Recovery);
        _rejected(
            abi.encodeCall(account.veto, (message, signedVeto)), Security.AccountV3Security__WrongProposal.selector
        );
        T.VetoProposal memory changed = _vetoMessage(account, member);
        changed.nonce = 0;
        _rejected(
            abi.encodeCall(
                account.veto,
                (changed, _memberSign(member, T.digest(block.chainid, address(account), T.hashVeto(changed))))
            ),
            Security.AccountV3Security__WrongNonce.selector
        );
    }

    function test_pendingNewMemberCannotVetoAndExpiryHasExactBoundary() public {
        bytes32 hash = _prepare(account, next, E.ChangeKind.Security);
        T.SignerDescriptor memory newcomer = _ecdsa(carol);
        T.VetoProposal memory message = _vetoMessage(account, newcomer);
        _rejected(
            abi.encodeCall(
                account.veto,
                (message, _memberSign(newcomer, T.digest(block.chainid, address(account), T.hashVeto(message))))
            ),
            Security.AccountV3Security__NotCurrentMember.selector
        );
        vm.warp(account.snapshot().pending.validUntil - 1);
        _rejected(abi.encodeCall(account.expire, (hash)), Security.AccountV3Security__NotExpired.selector);
        vm.warp(block.timestamp + 1);
        account.expire(hash);
        assertEq(account.snapshot().admin, 1);
        _assertEmpty(account.snapshot().pending);
    }

    function test_freezeIsIrreversibleSurvivesRecoveryAndDoesNotRestartTheWait() public {
        _prepare(account, next, E.ChangeKind.Recovery);
        V3SecurityHarness.Snapshot memory before_ = account.snapshot();
        _freeze(account);
        V3SecurityHarness.Snapshot memory frozen = account.snapshot();
        assertTrue(frozen.frozen);
        assertEq(frozen.pending.readyAt, before_.pending.readyAt);
        assertEq(frozen.pending.proposalHash, before_.pending.proposalHash);
        assertEq(frozen.version, before_.version);
        assertEq(frozen.manifest, before_.manifest);
        assertEq(frozen.admin, 1);
        vm.warp(frozen.pending.readyAt);
        account.activate(frozen.pending.proposalHash);
        assertTrue(account.snapshot().frozen);
        _rejected(_freezeData(), Security.AccountV3Security__AlreadyFrozen.selector);
        _prepare(account, _policy(bob, dave), E.ChangeKind.Security);
        _commit(account);
        assertTrue(account.snapshot().frozen);
    }

    function test_policyCommitCannotExecuteSeededUpgradeAndFreezeClearsItsPayload() public {
        account.seedUpgrade(); // Edge fixture, not evidence of a real upgrade proposal/execution.
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth = _votes(
            account.snapshot().policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN
        );
        _rejected(abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__WrongProposal.selector);
        _freeze(account);
        _assertEmpty(account.snapshot().pending);
        assertEq(account.snapshot().version, 1);
    }

    function test_recoveryReplacementClearsSeededUpgradePayload() public {
        account.seedUpgrade();
        _prepare(account, next, E.ChangeKind.Recovery);
        assertEq(account.snapshot().pending.upgrade.runtimeCodeHash, bytes32(0));
        assertEq(uint8(account.snapshot().pending.kind), uint8(D.ProposalKind.Recovery));
    }

    function test_missingPossessionAndProposalSignatureReusedAsCommitFail() public {
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Security), P.ADMIN);
        _rejected(
            abi.encodeCall(
                account.prepare, (E.ChangeKind.Security, change, next, _chains(), auth, new S.Signature[](0))
            ),
            Security.AccountV3Security__InvalidConsent.selector
        );
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        _rejected(abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__InvalidConsent.selector);
    }

    function testFuzz_evenFreshSignaturesCannotOverrideStoredIdentityVersionNonceOrScope(uint8 mutation) public {
        mutation = SafeCast.toUint8(bound(mutation, 0, 10));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        bytes4 reason;
        if (mutation == 0) {
            change.accountId = keccak256("wrong");
            reason = Security.AccountV3Security__WrongAccount.selector;
        } else if (mutation == 1) {
            change.generation = 2;
            reason = Security.AccountV3Security__WrongAccount.selector;
        } else if (mutation == 2) {
            ++change.securityVersion;
            reason = Security.AccountV3Security__StaleVersion.selector;
        } else if (mutation == 3) {
            change.previousManifestHash = keccak256("wrong");
            reason = Security.AccountV3Security__WrongPredecessor.selector;
        } else if (mutation == 4) {
            ++change.nonce;
            reason = Security.AccountV3Security__WrongNonce.selector;
        } else if (mutation == 5) {
            change.chainScopeHash = keccak256("wrong");
            reason = Security.AccountV3Security__WrongScope.selector;
        } else if (mutation == 6) {
            ++change.validAfter;
            reason = Security.AccountV3Security__OutsideValidity.selector;
        } else if (mutation == 7) {
            change.validUntil = change.validAfter;
            reason = Security.AccountV3Security__OutsideValidity.selector;
        } else if (mutation == 8) {
            change.nextPolicyHash = keccak256("wrong");
            reason = Security.AccountV3Security__WrongPolicy.selector;
        } else if (mutation == 9) {
            next = account.snapshot().policy;
            change.nextPolicyHash = T.hashPolicy(next);
            reason = Security.AccountV3Security__WrongPolicy.selector;
        } else {
            --change.validAfter;
            change.validUntil = SafeCast.toUint48(block.timestamp);
            reason = Security.AccountV3Security__OutsideValidity.selector;
        }
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Security), P.ADMIN);
        S.Signature[] memory proofs = _proofs(account, next, change, E.ChangeKind.Security);
        _rejected(
            abi.encodeCall(account.prepare, (E.ChangeKind.Security, change, next, _chains(), auth, proofs)), reason
        );
    }

    function testFuzz_scopeMustBeCanonicalBoundedAndContainCurrentChain(uint8 mutation) public {
        mutation = SafeCast.toUint8(bound(mutation, 0, 5));
        uint256[] memory chains;
        if (mutation == 0) {
            chains = new uint256[](0);
        } else if (mutation == 1) {
            chains = new uint256[](1);
        } else if (mutation == 2) {
            chains = new uint256[](1);
            chains[0] = 99;
        } else if (mutation == 3) {
            chains = new uint256[](2);
            chains[0] = block.chainid;
            chains[1] = block.chainid;
        } else if (mutation == 4) {
            chains = new uint256[](2);
            chains[0] = block.chainid;
            chains[1] = 1;
        } else {
            chains = new uint256[](33);
            for (uint256 i; i < 33; ++i) {
                chains[i] = i + 1;
            }
        }
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        change.chainScopeHash = keccak256(abi.encode(chains));
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Security), P.ADMIN);
        _rejected(
            abi.encodeCall(
                account.prepare,
                (
                    E.ChangeKind.Security,
                    change,
                    next,
                    chains,
                    auth,
                    _proofs(account, next, change, E.ChangeKind.Security)
                )
            ),
            Security.AccountV3Security__WrongScope.selector
        );
    }

    function test_domainBindsChainAndAccountEvenWhenPolicyAndScopeAreShared() public {
        uint256[] memory chains = new uint256[](2);
        chains[0] = 31337;
        chains[1] = 31338;
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Security);
        change.chainScopeHash = keccak256(abi.encode(chains));
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Security), P.ADMIN);
        S.Signature[] memory proofs = _proofs(account, next, change, E.ChangeKind.Security);
        vm.chainId(31338);
        _rejected(
            abi.encodeCall(account.prepare, (E.ChangeKind.Security, change, next, chains, auth, proofs)),
            Security.AccountV3Security__InvalidConsent.selector
        );
        vm.chainId(31337);
        account = new V3SecurityEdgeHarness(_policy(alice, bob), keccak256(abi.encode(_chains())));
        _rejected(
            abi.encodeCall(account.prepare, (E.ChangeKind.Security, change, next, chains, auth, proofs)),
            Security.AccountV3Security__InvalidConsent.selector
        );
    }

    function testFuzz_commitMustMatchProposalScopeAcknowledgementsAndFreshNonce(uint8 mutation) public {
        mutation = SafeCast.toUint8(bound(mutation, 0, 4));
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        bytes4 reason;
        if (mutation == 0) {
            message.proposalHash = keccak256("another");
            reason = Security.AccountV3Security__WrongProposal.selector;
        } else if (mutation == 1) {
            message.chainScopeHash = keccak256("another");
            reason = Security.AccountV3Security__WrongScope.selector;
        } else if (mutation == 2) {
            message.acknowledgementsHash = bytes32(0);
            reason = Security.AccountV3Security__MissingAcknowledgements.selector;
        } else if (mutation == 3) {
            --message.nonce;
            reason = Security.AccountV3Security__WrongNonce.selector;
        } else {
            message.validUntil = SafeCast.toUint48(block.timestamp);
            reason = Security.AccountV3Security__OutsideValidity.selector;
        }
        S.Signature[] memory auth = _votes(
            account.snapshot().policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN
        );
        _rejected(abi.encodeCall(account.commit, (message, auth)), reason);
    }

    function test_commitBeforeOwnDeadlineStillCannotCommitExpiredProposal() public {
        _prepare(account, next, E.ChangeKind.Security);
        vm.warp(account.snapshot().pending.validUntil);
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth = _votes(
            account.snapshot().policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN
        );
        _rejected(
            abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__ProposalNotReady.selector
        );
    }

    function testFuzz_recoveryWaitMustFitEntirelyInsideProposalValidity(uint48 window) public {
        window = SafeCast.toUint48(bound(window, 301, 72 hours));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Recovery);
        change.proposalValidUntil = SafeCast.toUint48(block.timestamp + window);
        S.Signature[] memory auth =
            _votes(account.snapshot().policy, _context(account, change, E.ChangeKind.Recovery), P.RECOVERY);
        _rejected(
            abi.encodeCall(
                account.prepare,
                (
                    E.ChangeKind.Recovery,
                    change,
                    next,
                    _chains(),
                    auth,
                    _proofs(account, next, change, E.ChangeKind.Recovery)
                )
            ),
            Security.AccountV3Security__TimelockExceedsValidity.selector
        );
    }

    function test_exhaustedNonceSpacesFailWithoutWraparound() public {
        account.seedNonces(type(uint256).max, 0, bytes32(0), 0);
        _rejected(_prepareData(E.ChangeKind.Security, next), Security.AccountV3Security__WrongNonce.selector);
        account.seedNonces(0, type(uint256).max, bytes32(0), 0);
        _rejected(_prepareData(E.ChangeKind.Recovery, next), Security.AccountV3Security__WrongNonce.selector);
        account.seedNonces(0, 0, T.signerId(_ecdsa(alice)), type(uint256).max);
        _prepare(account, next, E.ChangeKind.Recovery);
        T.VetoProposal memory message = _vetoMessage(account, _ecdsa(alice));
        _rejected(
            abi.encodeCall(
                account.veto,
                (message, _memberSign(_ecdsa(alice), T.digest(block.chainid, address(account), T.hashVeto(message))))
            ),
            Security.AccountV3Security__WrongNonce.selector
        );
    }

    function test_exhaustedVersionRevertsCommitIncludingItsNonceIncrement() public {
        account.seedHeader(true, false, type(uint64).max);
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth = _votes(
            account.snapshot().policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN
        );
        _rejected(abi.encodeCall(account.commit, (message, auth)), SafeCast.SafeCastOverflowedUintDowncast.selector);
        assertEq(account.snapshot().admin, 1);
    }

    function test_timeOverflowCannotWrapRecoveryReadyAt() public {
        vm.warp(uint256(type(uint48).max) - 1 days);
        T.SecurityChange memory change = T.SecurityChange(
            account.snapshot().id,
            3,
            1,
            account.snapshot().manifest,
            T.hashPolicy(next),
            keccak256(abi.encode(_chains())),
            0,
            SafeCast.toUint48(block.timestamp),
            SafeCast.toUint48(block.timestamp + 5 minutes),
            type(uint48).max
        );
        _rejected(
            abi.encodeCall(
                account.prepare,
                (E.ChangeKind.Recovery, change, next, _chains(), new S.Signature[](0), new S.Signature[](0))
            ),
            SafeCast.SafeCastOverflowedUintDowncast.selector
        );
    }

    function test_allMutationsRejectDuringAssetExecution() public {
        bytes memory prepareData = _prepareData(E.ChangeKind.Security, next);
        _prepare(account, next, E.ChangeKind.Recovery);
        T.CommitProposal memory commit_ = _commitMessage(account);
        T.VetoProposal memory veto_ = _vetoMessage(account, _ecdsa(alice));
        bytes memory freezeData = _freezeData();
        bytes32 hash = account.snapshot().pending.proposalHash;
        account.seedHeader(true, true, 1);
        _rejected(prepareData, Security.AccountV3Security__Executing.selector);
        _rejected(
            abi.encodeCall(account.commit, (commit_, new S.Signature[](0))),
            Security.AccountV3Security__Executing.selector
        );
        _rejected(abi.encodeCall(account.activate, (hash)), Security.AccountV3Security__Executing.selector);
        _rejected(abi.encodeCall(account.veto, (veto_, bytes(""))), Security.AccountV3Security__Executing.selector);
        _rejected(freezeData, Security.AccountV3Security__Executing.selector);
        _rejected(abi.encodeCall(account.expire, (hash)), Security.AccountV3Security__Executing.selector);
        _rejected(abi.encodeCall(account.spendEnabled, ()), Security.AccountV3Security__Executing.selector);
    }

    function test_uninitializedNamespaceCannotBeUsed() public {
        bytes memory data = _prepareData(E.ChangeKind.Security, next);
        account.seedHeader(false, false, 1);
        _rejected(data, Security.AccountV3Security__Uninitialized.selector);
    }

    function test_actualWebAuthnBootstrapRequiresSeparatePromotionAndCommitConsent() public {
        AccountV3WebAuthnVerifier verifier = new AccountV3WebAuthnVerifier();
        (uint256 x, uint256 y) = vm.publicKeyP256(1); // Public mathematical test vector ONLY.
        bytes memory key = abi.encodePacked(sha256("gatopago.com"), sha256("https://gatopago.com"), x, y);
        T.SecurityPolicy memory bootstrap = _policy(alice, bob);
        bootstrap.mode = P.BOOTSTRAP;
        bootstrap.adminThreshold = 0;
        bootstrap.recoveryThreshold = 0;
        bootstrap.signers = new T.SignerDescriptor[](1);
        bootstrap.signers[0] =
            T.SignerDescriptor(P.WEBAUTHN, address(verifier), address(verifier).codehash, key, P.SPEND, false);
        T.SecurityPolicy memory active = _policy(alice, bob);
        active.signers[1] = T.SignerDescriptor(P.WEBAUTHN, address(verifier), address(verifier).codehash, key, 7, false);
        active.signers[0] = _ecdsa(alice);
        _sort(active);
        account = new V3SecurityEdgeHarness(bootstrap, keccak256(abi.encode(_chains())));
        vm.mockCall(address(0x100), bytes(""), bytes("")); // Force genuine OZ software P256 verification.
        _rejected(abi.encodeCall(account.spendEnabled, ()), Security.AccountV3Security__SpendingDisabled.selector);
        _rejected(_prepareData(E.ChangeKind.Security, active), Security.AccountV3Security__WrongMode.selector);
        _rejected(_freezeData(), Security.AccountV3Security__WrongMode.selector);
        _prepare(account, active, E.ChangeKind.Bootstrap);
        _rejected(abi.encodeCall(account.spendEnabled, ()), Security.AccountV3Security__SpendingDisabled.selector);
        vm.warp(block.timestamp + 1 hours);
        _commit(account);
        account.spendEnabled();
        assertEq(account.snapshot().version, 2);
        assertEq(account.snapshot().admin, 2);
        assertEq(T.hashPolicy(account.snapshot().policy), T.hashPolicy(active));
    }

    function test_recoveryAndAdminUseDifferentAuthoritiesEvenWithFreshPurposeCorrectSignatures() public {
        T.SecurityPolicy memory separate = _policy(alice, bob);
        separate.signers = new T.SignerDescriptor[](4);
        separate.signers[0] = _ecdsa(alice);
        separate.signers[0].roles = P.SPEND | P.ADMIN;
        separate.signers[1] = _ecdsa(bob);
        separate.signers[1].roles = P.SPEND | P.ADMIN;
        separate.signers[2] = _ecdsa(carol);
        separate.signers[2].roles = P.RECOVERY;
        separate.signers[3] = _ecdsa(dave);
        separate.signers[3].roles = P.RECOVERY;
        _sort(separate);
        account = new V3SecurityEdgeHarness(separate, keccak256(abi.encode(_chains())));
        T.SecurityChange memory change = _change(account, next, E.ChangeKind.Recovery);
        S.Signature[] memory wrongRole = _votes(separate, _context(account, change, E.ChangeKind.Recovery), P.ADMIN);
        _rejected(
            abi.encodeCall(
                account.prepare,
                (
                    E.ChangeKind.Recovery,
                    change,
                    next,
                    _chains(),
                    wrongRole,
                    _proofs(account, next, change, E.ChangeKind.Recovery)
                )
            ),
            Security.AccountV3Security__InvalidConsent.selector
        );
        _prepare(account, next, E.ChangeKind.Recovery);
        _veto(account, _ecdsa(dave)); // signerId excludes roles; recovery-only guardian may veto.
        assertEq(account.vetoNonce(T.signerId(_ecdsa(dave))), 1);
    }

    function test_mutableERC1271IsRevalidatedAtCommitEvenWhenCodehashDidNotChange() public {
        V3TestContractSigner contractSigner = new V3TestContractSigner(bob);
        testKeys[address(contractSigner)] = testKeys[bob];
        T.SecurityPolicy memory policy = _policy(alice, bob);
        policy.signers[0] = _ecdsa(alice);
        policy.signers[1] = T.SignerDescriptor(
            P.ERC1271,
            address(contractSigner),
            address(contractSigner).codehash,
            abi.encodePacked(address(contractSigner)),
            7,
            false
        );
        _sort(policy);
        account = new V3SecurityEdgeHarness(policy, keccak256(abi.encode(_chains())));
        _prepare(account, next, E.ChangeKind.Security);
        T.CommitProposal memory message = _commitMessage(account);
        S.Signature[] memory auth =
            _votes(policy, T.digest(block.chainid, address(account), T.hashCommit(message)), P.ADMIN);
        bytes32 pinned = address(contractSigner).codehash;
        contractSigner.revoke();
        assertEq(address(contractSigner).codehash, pinned);
        _rejected(abi.encodeCall(account.commit, (message, auth)), Security.AccountV3Security__InvalidConsent.selector);
        _veto(account, _ecdsa(alice));
        assertEq(account.snapshot().admin, 1);
    }

    function _prepareData(E.ChangeKind kind, T.SecurityPolicy memory policy) private view returns (bytes memory) {
        T.SecurityChange memory change = _change(account, policy, kind);
        uint8 role = kind == E.ChangeKind.Bootstrap ? P.SPEND : kind == E.ChangeKind.Security ? P.ADMIN : P.RECOVERY;
        return abi.encodeCall(
            account.prepare,
            (
                kind,
                change,
                policy,
                _chains(),
                _votes(account.snapshot().policy, _context(account, change, kind), role),
                _proofs(account, policy, change, kind)
            )
        );
    }

    function _freezeData() private view returns (bytes memory) {
        T.FreezeUpgrades memory message = _freezeMessage(account);
        return abi.encodeCall(
            account.freeze,
            (
                message,
                _chains(),
                _votes(
                    account.snapshot().policy, T.digest(block.chainid, address(account), T.hashFreeze(message)), P.ADMIN
                )
            )
        );
    }

    function _rejected(bytes memory data, bytes4 reason) private {
        bytes32 before_ = _fingerprint(account);
        (bool ok, bytes memory result) = address(account).call(data);
        assertFalse(ok, "unauthorized transition accepted");
        assertGe(result.length, 4, "missing custom error selector");
        // Intentionally compare the first four bytes of an ABI error, not a numeric narrowing cast.
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(bytes4(result), reason, "unexpected revert selector");
        assertEq(_fingerprint(account), before_, "rejected transition mutated state");
    }

    function _assertEmpty(D.PendingProposal memory pending) private pure {
        assertEq(uint8(pending.kind), uint8(D.ProposalKind.None));
        assertEq(pending.proposalHash, bytes32(0));
        assertEq(pending.nextPolicy.signers.length, 0);
        assertEq(pending.upgrade.runtimeCodeHash, bytes32(0));
    }
}
