// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";
import {
    ReturnsFalseToken,
    RevertingToken,
    BlocklistToken,
    ReentrantToken,
    ReentrantRecipient
} from "./mocks/BadTokens.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

contract SplitPayGroupsBadTokensTest is Test {
    bytes32 internal constant SALT = keccak256("group-1");
    bytes32 internal GID;
    address internal creator = makeAddr("creator");
    address internal recipient = makeAddr("recipient");
    address internal alice = makeAddr("alice");
    uint64 internal deadline;

    function setUp() public {
        vm.warp(1_700_000_000);
        deadline = uint64(block.timestamp + 7 days);
    }

    function _deploy(address token, address rcpt) internal returns (SplitPayGroups c) {
        c = new SplitPayGroups(IERC20(token));
        IMintable(token).mint(alice, 1_000e6);
        vm.prank(alice);
        IMintable(token).approve(address(c), type(uint256).max);
        vm.prank(creator);
        c.createGroup(SALT, rcpt, 100e6, deadline, bytes32(0));
        GID = c.groupIdFor(creator, SALT);
    }

    function _assertUntouched(SplitPayGroups c, address token, address rcpt) internal view {
        assertEq(c.totalCollected(GID), 0, "collected");
        assertEq(c.remaining(GID), 100e6, "remaining");
        assertEq(c.contributionOf(GID, alice), 0, "contributionOf");
        assertEq(IMintable(token).balanceOf(alice), 1_000e6, "payer balance");
        assertEq(IMintable(token).balanceOf(rcpt), 0, "recipient balance");
        assertEq(IMintable(token).balanceOf(address(c)), 0, "contract balance");
    }

    // ───────────── transfer returns false ─────────────

    function test_TransferReturningFalse_RevertsAndLeavesStateUnchanged() public {
        ReturnsFalseToken t = new ReturnsFalseToken();
        SplitPayGroups c = _deploy(address(t), recipient);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(t)));
        vm.prank(alice);
        c.contribute(GID, 10e6, "x");
        _assertUntouched(c, address(t), recipient);
    }

    // ───────────── transfer reverts ─────────────

    function test_TransferReverting_BubblesAndLeavesStateUnchanged() public {
        RevertingToken t = new RevertingToken();
        SplitPayGroups c = _deploy(address(t), recipient);
        vm.expectRevert(RevertingToken.TransferFromReverted.selector);
        vm.prank(alice);
        c.contribute(GID, 10e6, "x");
        _assertUntouched(c, address(t), recipient);
    }

    // ───────────── blocklisted recipient ─────────────

    function test_BlocklistedRecipient_RevertsAndLeavesStateUnchanged() public {
        BlocklistToken t = new BlocklistToken();
        SplitPayGroups c = _deploy(address(t), recipient);
        t.setBlocked(recipient, true);
        vm.expectRevert(abi.encodeWithSelector(BlocklistToken.RecipientBlocklisted.selector, recipient));
        vm.prank(alice);
        c.contribute(GID, 10e6, "x");
        _assertUntouched(c, address(t), recipient);
    }

    function test_BlocklistedRecipient_ContributionsResumeWhenUnblocked() public {
        BlocklistToken t = new BlocklistToken();
        SplitPayGroups c = _deploy(address(t), recipient);
        t.setBlocked(recipient, true);
        vm.prank(alice);
        vm.expectRevert();
        c.contribute(GID, 10e6, "x");
        t.setBlocked(recipient, false);
        vm.prank(alice);
        c.contribute(GID, 10e6, "x");
        assertEq(c.totalCollected(GID), 10e6);
        assertEq(t.balanceOf(recipient), 10e6);
        assertEq(t.balanceOf(address(c)), 0);
    }

    // ───────────── reentrancy ─────────────

    function _reentrant(bool atkContribute, bool atkCreate, bool bubble)
        internal
        returns (SplitPayGroups c, ReentrantToken t, ReentrantRecipient r)
    {
        t = new ReentrantToken();
        r = new ReentrantRecipient();
        c = _deploy(address(t), address(r));
        // Recipient is funded + approved so a re-entrant contribute would otherwise be payable.
        t.mint(address(r), 100e6);
        r.configure(c, GID, 5e6, keccak256("group-2"), atkContribute, atkCreate, bubble);
        r.approveTarget(address(t));
    }

    function test_Reentrancy_ContributeIsBlockedByGuard_SwallowedByHook() public {
        (SplitPayGroups c, ReentrantToken t, ReentrantRecipient r) = _reentrant(true, false, false);
        vm.prank(alice);
        c.contribute(GID, 10e6, "outer");

        assertTrue(r.contributeAttempted());
        assertFalse(r.contributeSucceeded());
        assertEq(
            bytes4(r.contributeRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector
        );
        // Only the outer contribution counted; the hook's 5 USDC wasn't pulled.
        assertEq(c.totalCollected(GID), 10e6);
        assertEq(c.contributionOf(GID, address(r)), 0);
        assertEq(t.balanceOf(address(r)), 110e6);
        assertEq(t.balanceOf(address(c)), 0);
    }

    function test_Reentrancy_ContributeBubbledRevertsWholeCall() public {
        (SplitPayGroups c, ReentrantToken t, ReentrantRecipient r) = _reentrant(true, false, true);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(alice);
        c.contribute(GID, 10e6, "outer");
        assertEq(c.totalCollected(GID), 0);
        assertEq(t.balanceOf(alice), 1_000e6);
        assertEq(t.balanceOf(address(r)), 100e6);
    }

    /// @dev createGroup is intentionally not guarded: it is permissionless and independent of
    /// in-flight contribution accounting. Re-entering it must not corrupt the outer group.
    function test_Reentrancy_CreateGroupDuringContributeDoesNotCorruptState() public {
        (SplitPayGroups c, ReentrantToken t, ReentrantRecipient r) = _reentrant(false, true, false);
        vm.prank(alice);
        c.contribute(GID, 10e6, "outer");

        assertTrue(r.createAttempted());
        assertTrue(r.createSucceeded());
        bytes32 hookId = c.groupIdFor(address(r), keccak256("group-2"));
        assertTrue(c.groupExists(hookId));
        assertEq(c.totalCollected(hookId), 0);
        assertEq(c.totalCollected(GID), 10e6);
        assertEq(c.remaining(GID), 90e6);
        assertEq(t.balanceOf(address(c)), 0);
    }

    function test_Reentrancy_CreateGroupWithDuplicateIdStillRejected() public {
        (SplitPayGroups c,, ReentrantRecipient r) = _reentrant(false, true, false);
        // The hook creates as the recipient contract; pre-create that same (creator, salt) pair.
        bytes32 hookSalt = keccak256("group-2");
        vm.prank(address(r));
        c.createGroup(hookSalt, address(0xCAFE), 1e6, deadline, bytes32(0));
        vm.prank(alice);
        c.contribute(GID, 10e6, "outer");
        assertTrue(r.createAttempted());
        assertFalse(r.createSucceeded());
        assertEq(bytes4(r.createRevertData()), SplitPayGroups.GroupAlreadyExists.selector);
        assertEq(c.totalCollected(GID), 10e6);
    }
}
