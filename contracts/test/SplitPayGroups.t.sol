// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SplitPayGroupsTestBase} from "./SplitPayGroups.Base.t.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";
import {Vm} from "forge-std/Vm.sol";

contract SplitPayGroupsTest is SplitPayGroupsTestBase {
    // ───────────── constructor ─────────────

    function test_Constructor_StoresToken() public view {
        assertEq(address(c.usdc()), address(usdc));
        assertEq(c.MAX_NAME_BYTES(), 24);
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(SplitPayGroups.InvalidToken.selector);
        new SplitPayGroups(IERC20(address(0)));
    }

    // ───────────── createGroup ─────────────

    function test_CreateGroup_StoresTermsAndEmits() public {
        vm.expectEmit(true, true, true, true, address(c));
        emit SplitPayGroups.GroupCreated(GID, creator, recipient, TARGET, deadline, META);
        vm.prank(creator);
        bytes32 id = c.createGroup(SALT, recipient, TARGET, deadline, META);
        assertEq(id, GID, "returned id is derived id");

        assertTrue(c.groupExists(GID));
        (address cr, address rc, uint256 tg, uint64 dl, uint256 col, bytes32 mh) = c.getGroup(GID);
        assertEq(cr, creator);
        assertEq(rc, recipient);
        assertEq(tg, TARGET);
        assertEq(dl, deadline);
        assertEq(col, 0);
        assertEq(mh, META);
    }

    function test_CreateGroup_RevertsOnDuplicateSaltFromSameCreator() public {
        _create();
        vm.expectRevert(SplitPayGroups.GroupAlreadyExists.selector);
        vm.prank(creator);
        c.createGroup(SALT, alice, 1, deadline, META);
        // original group untouched
        (, address rc, uint256 tg,,,) = c.getGroup(GID);
        assertEq(rc, recipient);
        assertEq(tg, TARGET);
    }

    function test_CreateGroup_RevertsOnZeroSalt() public {
        vm.expectRevert(SplitPayGroups.InvalidSalt.selector);
        c.createGroup(bytes32(0), recipient, TARGET, deadline, META);
    }

    function test_CreateGroup_RevertsOnZeroRecipient() public {
        vm.expectRevert(SplitPayGroups.InvalidRecipient.selector);
        c.createGroup(SALT, address(0), TARGET, deadline, META);
    }

    function test_CreateGroup_RevertsOnContractRecipient() public {
        vm.expectRevert(SplitPayGroups.InvalidRecipient.selector);
        c.createGroup(SALT, address(c), TARGET, deadline, META);
    }

    function test_CreateGroup_RevertsOnTokenRecipient() public {
        vm.expectRevert(SplitPayGroups.InvalidRecipient.selector);
        c.createGroup(SALT, address(usdc), TARGET, deadline, META);
    }

    function test_CreateGroup_RevertsOnZeroTarget() public {
        vm.expectRevert(SplitPayGroups.InvalidTarget.selector);
        c.createGroup(SALT, recipient, 0, deadline, META);
    }

    function test_CreateGroup_RevertsOnCurrentTimestampDeadline() public {
        vm.expectRevert(SplitPayGroups.InvalidDeadline.selector);
        c.createGroup(SALT, recipient, TARGET, uint64(block.timestamp), META);
    }

    function test_CreateGroup_RevertsOnPastDeadline() public {
        vm.expectRevert(SplitPayGroups.InvalidDeadline.selector);
        c.createGroup(SALT, recipient, TARGET, uint64(block.timestamp - 1), META);
        vm.expectRevert(SplitPayGroups.InvalidDeadline.selector);
        c.createGroup(SALT, recipient, TARGET, 0, META);
    }

    function test_CreateGroup_AcceptsDeadlineOneSecondAhead() public {
        vm.prank(creator);
        c.createGroup(SALT, recipient, TARGET, uint64(block.timestamp + 1), META);
        assertTrue(c.groupExists(GID));
    }

    function test_CreateGroup_FailedCreateLeavesNoGroup() public {
        vm.expectRevert(SplitPayGroups.InvalidTarget.selector);
        vm.prank(creator);
        c.createGroup(SALT, recipient, 0, deadline, META);
        assertFalse(c.groupExists(GID));
    }

    // ───────────── contribute: happy paths ─────────────

    function test_Contribute_SendsFundsDirectlyToRecipient() public {
        _create();
        uint256 aliceBefore = usdc.balanceOf(alice);
        _pay(alice, 10e6);
        assertEq(usdc.balanceOf(recipient), 10e6);
        assertEq(usdc.balanceOf(alice), aliceBefore - 10e6);
        assertEq(usdc.balanceOf(address(c)), 0);
        assertEq(c.totalCollected(GID), 10e6);
        assertEq(c.contributionOf(GID, alice), 10e6);
        assertEq(c.remaining(GID), TARGET - 10e6);
    }

    function test_Contribute_EmitsEventWithRunningTotal() public {
        _create();
        vm.expectEmit(true, true, false, true, address(c));
        emit SplitPayGroups.ContributionReceived(GID, alice, 30e6, 30e6, "alice");
        vm.prank(alice);
        c.contribute(GID, 30e6, "alice");

        vm.expectEmit(true, true, false, true, address(c));
        emit SplitPayGroups.ContributionReceived(GID, bob, 5e6, 35e6, "bob");
        vm.prank(bob);
        c.contribute(GID, 5e6, "bob");
    }

    function test_Contribute_PartialPaymentsAccumulatePerWalletAndAcrossWallets() public {
        _create();
        _pay(alice, 10e6);
        _pay(alice, 15e6);
        _pay(bob, 20e6);
        _pay(carol, 1);
        _pay(alice, 1);
        assertEq(c.contributionOf(GID, alice), 25e6 + 1);
        assertEq(c.contributionOf(GID, bob), 20e6);
        assertEq(c.contributionOf(GID, carol), 1);
        assertEq(c.totalCollected(GID), 45e6 + 2);
        assertEq(c.remaining(GID), TARGET - 45e6 - 2);
        assertEq(usdc.balanceOf(recipient), 45e6 + 2);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function test_Contribute_ExactFillSucceedsThenAnyFurtherPaymentReverts() public {
        _create();
        _pay(alice, 60e6);
        _pay(bob, 40e6);
        assertEq(c.remaining(GID), 0);
        assertEq(c.totalCollected(GID), TARGET);

        vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.TargetExceeded.selector, 1, 0));
        vm.prank(carol);
        c.contribute(GID, 1, "late");
        // Zero is still InvalidAmount even when the group is full.
        vm.expectRevert(SplitPayGroups.InvalidAmount.selector);
        vm.prank(carol);
        c.contribute(GID, 0, "zero");
    }

    function test_Contribute_SingleExactFill() public {
        _create();
        _pay(alice, TARGET);
        assertEq(c.remaining(GID), 0);
        assertEq(usdc.balanceOf(recipient), TARGET);
    }

    function test_Contribute_SixDecimalSanity() public {
        _create();
        _pay(alice, 1_000_000); // exactly 1 USDC
        assertEq(c.totalCollected(GID), 1_000_000);
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(recipient), 1e6);
        assertEq(c.remaining(GID), 99_000_000);
        _pay(bob, 1); // smallest unit = 0.000001 USDC
        assertEq(c.contributionOf(GID, bob), 1);
    }

    // ───────────── contribute: deadline ─────────────

    function test_Contribute_SucceedsExactlyAtDeadline() public {
        _create();
        vm.warp(deadline);
        _pay(alice, 1e6);
        assertEq(c.totalCollected(GID), 1e6);
    }

    function test_Contribute_RevertsAtDeadlinePlusOne() public {
        _create();
        vm.warp(uint256(deadline) + 1);
        vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.GroupExpired.selector, GID, deadline));
        vm.prank(alice);
        c.contribute(GID, 1e6, "late");
    }

    function test_Views_StillWorkAfterDeadline() public {
        _create();
        _pay(alice, 10e6);
        vm.warp(uint256(deadline) + 365 days);
        assertEq(c.remaining(GID), TARGET - 10e6);
        assertEq(c.totalCollected(GID), 10e6);
        assertTrue(c.groupExists(GID));
    }

    // ───────────── contribute: reverts ─────────────

    function test_Contribute_RevertsOnUnknownGroup() public {
        vm.expectRevert(SplitPayGroups.GroupNotFound.selector);
        vm.prank(alice);
        c.contribute(GID, 1e6, "x");
    }

    function test_Contribute_RevertsOnZeroAmount() public {
        _create();
        vm.expectRevert(SplitPayGroups.InvalidAmount.selector);
        vm.prank(alice);
        c.contribute(GID, 0, "x");
    }

    function test_Contribute_RevertsOnOverpayment() public {
        _create();
        _pay(alice, 90e6);
        vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.TargetExceeded.selector, 10e6 + 1, 10e6));
        vm.prank(bob);
        c.contribute(GID, 10e6 + 1, "x");
        vm.expectRevert(
            abi.encodeWithSelector(SplitPayGroups.TargetExceeded.selector, type(uint256).max, 10e6)
        );
        vm.prank(bob);
        c.contribute(GID, type(uint256).max, "x");
        // state unchanged
        assertEq(c.totalCollected(GID), 90e6);
        assertEq(usdc.balanceOf(recipient), 90e6);
    }

    function test_Contribute_RevertsOnInsufficientAllowance() public {
        _create();
        address dave = makeAddr("dave");
        usdc.mint(dave, 100e6);
        vm.prank(dave);
        usdc.approve(address(c), 5e6);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(c), 5e6, 6e6)
        );
        vm.prank(dave);
        c.contribute(GID, 6e6, "dave");
        assertEq(c.totalCollected(GID), 0);
        assertEq(c.contributionOf(GID, dave), 0);
        assertEq(usdc.balanceOf(dave), 100e6);
    }

    function test_Contribute_RevertsOnInsufficientBalance() public {
        _create();
        address dave = makeAddr("dave");
        usdc.mint(dave, 2e6);
        vm.prank(dave);
        usdc.approve(address(c), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, dave, 2e6, 3e6));
        vm.prank(dave);
        c.contribute(GID, 3e6, "dave");
        assertEq(c.totalCollected(GID), 0);
        assertEq(c.contributionOf(GID, dave), 0);
        assertEq(usdc.balanceOf(recipient), 0);
    }

    // ───────────── names (byte-length rule) ─────────────

    function _payName(string memory name) internal {
        vm.prank(alice);
        c.contribute(GID, 1, name);
    }

    function test_Name_EmptyAccepted() public {
        _create();
        vm.expectEmit(true, true, false, true, address(c));
        emit SplitPayGroups.ContributionReceived(GID, alice, 1, 1, "");
        _payName("");
    }

    function test_Name_24AsciiBytesAccepted() public {
        _create();
        string memory n = "abcdefghijklmnopqrstuvwx";
        assertEq(bytes(n).length, 24);
        vm.expectEmit(true, true, false, true, address(c));
        emit SplitPayGroups.ContributionReceived(GID, alice, 1, 1, n);
        _payName(n);
    }

    function test_Name_25AsciiBytesRejected() public {
        _create();
        string memory n = "abcdefghijklmnopqrstuvwxy";
        assertEq(bytes(n).length, 25);
        vm.expectRevert(SplitPayGroups.NameTooLong.selector);
        _payName(n);
        assertEq(c.totalCollected(GID), 0);
    }

    function test_Name_EightFourByteEmojiRejected() public {
        _create();
        string memory n = unicode"😀😀😀😀😀😀😀😀";
        assertEq(bytes(n).length, 32);
        vm.expectRevert(SplitPayGroups.NameTooLong.selector);
        _payName(n);
    }

    function test_Name_SixFourByteEmojiAccepted() public {
        _create();
        string memory n = unicode"😀😀😀😀😀😀";
        assertEq(bytes(n).length, 24);
        vm.expectEmit(true, true, false, true, address(c));
        emit SplitPayGroups.ContributionReceived(GID, alice, 1, 1, n);
        _payName(n);
    }

    function test_Name_SevenFourByteEmojiRejected() public {
        _create();
        string memory n = unicode"😀😀😀😀😀😀😀";
        assertEq(bytes(n).length, 28);
        vm.expectRevert(SplitPayGroups.NameTooLong.selector);
        _payName(n);
    }

    function test_Name_MultiByteCountedByBytesNotChars() public {
        _create();
        // 12 two-byte chars = 24 bytes OK; 13 = 26 bytes rejected.
        string memory two12 = unicode"éééééééééééé";
        string memory two13 = string.concat(two12, unicode"é");
        assertEq(bytes(two12).length, 24);
        assertEq(bytes(two13).length, 26);
        _payName(two12);
        vm.expectRevert(SplitPayGroups.NameTooLong.selector);
        _payName(two13);
        // 8 three-byte chars = 24 OK; 9 = 27 rejected.
        string memory three8 = unicode"€€€€€€€€";
        string memory three9 = unicode"€€€€€€€€€";
        assertEq(bytes(three8).length, 24);
        assertEq(bytes(three9).length, 27);
        _payName(three8);
        vm.expectRevert(SplitPayGroups.NameTooLong.selector);
        _payName(three9);
    }

    // ───────────── views ─────────────

    function test_Views_UnknownGroup() public {
        bytes32 unknown = keccak256("nope");
        assertFalse(c.groupExists(unknown));
        assertEq(c.contributionOf(unknown, alice), 0);
        vm.expectRevert(SplitPayGroups.GroupNotFound.selector);
        c.getGroup(unknown);
        vm.expectRevert(SplitPayGroups.GroupNotFound.selector);
        c.totalCollected(unknown);
        vm.expectRevert(SplitPayGroups.GroupNotFound.selector);
        c.remaining(unknown);
    }

    function test_Views_GetGroupReflectsCollected() public {
        _create();
        _pay(alice, 33e6);
        (,,,, uint256 col,) = c.getGroup(GID);
        assertEq(col, 33e6);
    }

    function test_Views_GroupsAreIndependent() public {
        _create();
        bytes32 gid2 = c.createGroup(keccak256("group-2"), bob, 10e6, deadline, META);
        _pay(alice, 5e6);
        assertEq(c.totalCollected(gid2), 0);
        assertEq(c.contributionOf(gid2, alice), 0);
        assertEq(c.contributionOf(GID, alice), 5e6);
    }

    // ───────────── ETH rejection ─────────────

    function test_RejectsPlainEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(c).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(c).balance, 0);
    }

    function test_RejectsEthWithCalldataAndPayableCalls() public {
        _create();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(c).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        vm.prank(alice);
        (ok,) = address(c).call{value: 1}(abi.encodeCall(SplitPayGroups.contribute, (GID, 1e6, "x")));
        assertFalse(ok);
        assertEq(address(c).balance, 0);
        assertEq(c.totalCollected(GID), 0);
    }

    // ───────────── derived ids / squat protection ─────────────

    function test_GroupIdFor_MatchesEmittedAndReturnedId() public {
        bytes32 expected = keccak256(abi.encode(creator, SALT));
        assertEq(c.groupIdFor(creator, SALT), expected);
        assertEq(GID, expected);

        vm.recordLogs();
        vm.prank(creator);
        bytes32 ret = c.createGroup(SALT, recipient, TARGET, deadline, META);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], SplitPayGroups.GroupCreated.selector);
        assertEq(logs[0].topics[1], expected, "emitted groupId");
        assertEq(ret, expected);

        vm.recordLogs();
        _pay(alice, 1e6);
        logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == SplitPayGroups.ContributionReceived.selector) {
                assertEq(logs[i].topics[1], expected, "contribution groupId");
                found = true;
            }
        }
        assertTrue(found);
    }

    function test_GroupIdFor_DiffersByCreatorAndSalt() public view {
        assertTrue(c.groupIdFor(creator, SALT) != c.groupIdFor(bob, SALT));
        assertTrue(c.groupIdFor(creator, SALT) != c.groupIdFor(creator, keccak256("other")));
        // raw salt is not itself a usable id
        assertTrue(c.groupIdFor(creator, SALT) != SALT);
    }

    function test_SameSaltTwoCreators_YieldTwoDistinctGroups() public {
        vm.prank(creator);
        bytes32 idA = c.createGroup(SALT, recipient, TARGET, deadline, META);
        vm.prank(bob);
        bytes32 idB = c.createGroup(SALT, carol, 50e6, deadline, bytes32(uint256(1)));
        assertTrue(idA != idB);
        assertEq(idB, c.groupIdFor(bob, SALT));

        (address crA, address rcA, uint256 tgA,,, bytes32 mhA) = c.getGroup(idA);
        (address crB, address rcB, uint256 tgB,,, bytes32 mhB) = c.getGroup(idB);
        assertEq(crA, creator);
        assertEq(rcA, recipient);
        assertEq(tgA, TARGET);
        assertEq(mhA, META);
        assertEq(crB, bob);
        assertEq(rcB, carol);
        assertEq(tgB, 50e6);
        assertEq(mhB, bytes32(uint256(1)));

        // accounting is independent
        vm.prank(alice);
        c.contribute(idA, 10e6, "a");
        assertEq(c.totalCollected(idA), 10e6);
        assertEq(c.totalCollected(idB), 0);
        assertEq(usdc.balanceOf(recipient), 10e6);
        assertEq(usdc.balanceOf(carol), 1_000e6, "carol (recipient of B) received nothing");
    }

    function test_FrontRun_AttackerCannotSquatVictimId() public {
        address attacker = makeAddr("attacker");
        // Attacker front-runs victim's tx with the same (publicly visible) salt and own recipient.
        vm.prank(attacker);
        bytes32 attackerId = c.createGroup(SALT, attacker, 1, deadline, META);
        assertTrue(attackerId != GID);
        assertFalse(c.groupExists(GID), "victim id untouched");

        // Victim's creation still succeeds, with their own recipient.
        vm.prank(creator);
        bytes32 victimId = c.createGroup(SALT, recipient, TARGET, deadline, META);
        assertEq(victimId, GID);
        (address cr, address rc, uint256 tg,,,) = c.getGroup(GID);
        assertEq(cr, creator);
        assertEq(rc, recipient);
        assertEq(tg, TARGET);

        // Payments to the victim's id reach the victim's recipient, not the attacker.
        _pay(alice, 10e6);
        assertEq(usdc.balanceOf(recipient), 10e6);
        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(c.totalCollected(attackerId), 0);
    }

    function test_FrontRun_AttackerCannotReuseVictimsDerivedIdAsSalt() public {
        _create();
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        bytes32 id = c.createGroup(GID, attacker, 1, deadline, META);
        assertTrue(id != GID);
        (address cr, address rc,,,,) = c.getGroup(GID);
        assertEq(cr, creator);
        assertEq(rc, recipient);
    }

    // ───────────── recipient cannot contribute ─────────────

    function _fundRecipient() internal {
        usdc.mint(recipient, 50e6);
        vm.prank(recipient);
        usdc.approve(address(c), type(uint256).max);
    }

    function test_Contribute_RecipientCannotContribute_NoStateChange() public {
        _create();
        _pay(alice, 10e6);
        _fundRecipient();
        uint256 recBefore = usdc.balanceOf(recipient);
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectRevert(SplitPayGroups.RecipientCannotContribute.selector);
        vm.prank(recipient);
        c.contribute(GID, 5e6, "self");

        assertEq(c.totalCollected(GID), 10e6);
        assertEq(c.remaining(GID), TARGET - 10e6);
        assertEq(c.contributionOf(GID, recipient), 0);
        assertEq(usdc.balanceOf(recipient), recBefore);
        assertEq(usdc.balanceOf(alice), aliceBefore);
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function test_Contribute_RecipientCheckAfterExpiryAndZeroAmount() public {
        _create();
        // zero amount from recipient -> InvalidAmount (checked first)
        vm.expectRevert(SplitPayGroups.InvalidAmount.selector);
        vm.prank(recipient);
        c.contribute(GID, 0, "x");
        // after expiry -> GroupExpired (checked first)
        vm.warp(uint256(deadline) + 1);
        vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.GroupExpired.selector, GID, deadline));
        vm.prank(recipient);
        c.contribute(GID, 1, "x");
    }

    function test_Contribute_RecipientCheckBeforeTargetCheck() public {
        _create();
        // Overpayment by the recipient reports RecipientCannotContribute, not TargetExceeded.
        vm.expectRevert(SplitPayGroups.RecipientCannotContribute.selector);
        vm.prank(recipient);
        c.contribute(GID, TARGET + 1, "x");
    }

    function test_Contribute_RecipientOfOneGroupCanContributeToAnother() public {
        _create();
        _fundRecipient();
        bytes32 other = c.createGroup(keccak256("other"), bob, 20e6, deadline, META);
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(recipient);
        c.contribute(other, 7e6, "r");
        assertEq(c.totalCollected(other), 7e6);
        assertEq(c.contributionOf(other, recipient), 7e6);
        assertEq(usdc.balanceOf(bob), bobBefore + 7e6);
    }

    function test_Contribute_RecipientsOtherWalletCanStillContribute() public {
        _create();
        address recipientAlt = makeAddr("recipientAlt");
        usdc.mint(recipientAlt, 20e6);
        vm.prank(recipientAlt);
        usdc.approve(address(c), type(uint256).max);
        vm.prank(recipientAlt);
        c.contribute(GID, 12e6, "alt");
        assertEq(c.totalCollected(GID), 12e6);
        assertEq(c.contributionOf(GID, recipientAlt), 12e6);
        assertEq(usdc.balanceOf(recipient), 12e6);
    }

    function test_Contribute_CreatorMayContributeWhenNotRecipient() public {
        _create();
        usdc.mint(creator, 5e6);
        vm.startPrank(creator);
        usdc.approve(address(c), type(uint256).max);
        c.contribute(GID, 5e6, "creator");
        vm.stopPrank();
        assertEq(c.contributionOf(GID, creator), 5e6);
    }

    function test_Contribute_CreatorWhoIsRecipientCannotContribute() public {
        vm.prank(creator);
        bytes32 id = c.createGroup(keccak256("self"), creator, TARGET, deadline, META);
        usdc.mint(creator, 5e6);
        vm.startPrank(creator);
        usdc.approve(address(c), type(uint256).max);
        vm.expectRevert(SplitPayGroups.RecipientCannotContribute.selector);
        c.contribute(id, 5e6, "x");
        vm.stopPrank();
        assertEq(c.totalCollected(id), 0);
    }
}
