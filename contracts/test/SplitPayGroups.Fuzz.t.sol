// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SplitPayGroupsTestBase} from "./SplitPayGroups.Base.t.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";

contract SplitPayGroupsFuzzTest is SplitPayGroupsTestBase {
    function testFuzz_AccountingConservation(uint256 target, uint256[8] memory amts, uint8[8] memory who)
        public
    {
        target = bound(target, 1, 1e15);
        address[3] memory wallets = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) usdc.mint(wallets[i], 2e15);

        vm.prank(creator);
        c.createGroup(SALT, recipient, target, deadline, META);

        uint256 expected;
        for (uint256 i; i < 8; ++i) {
            address w = wallets[who[i] % 3];
            uint256 amt = bound(amts[i], 1, target);
            uint256 rem = target - expected;
            if (amt > rem) {
                vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.TargetExceeded.selector, amt, rem));
                vm.prank(w);
                c.contribute(GID, amt, "f");
            } else {
                vm.prank(w);
                c.contribute(GID, amt, "f");
                expected += amt;
            }
            assertLe(c.totalCollected(GID), target);
        }

        uint256 sum = c.contributionOf(GID, alice) + c.contributionOf(GID, bob) + c.contributionOf(GID, carol);
        assertEq(sum, c.totalCollected(GID), "sum of wallets == collected");
        assertEq(c.totalCollected(GID), expected);
        assertEq(usdc.balanceOf(recipient), c.totalCollected(GID), "recipient == collected");
        assertEq(c.remaining(GID), target - expected);
        assertEq(usdc.balanceOf(address(c)), 0, "contract holds nothing");
    }

    function testFuzz_OverpaymentAlwaysReverts(uint256 target, uint256 first, uint256 extra) public {
        target = bound(target, 1, 1e15);
        first = bound(first, 1, target);
        usdc.mint(alice, 2e15);
        vm.prank(alice);
        usdc.approve(address(c), type(uint256).max);
        vm.prank(creator);
        c.createGroup(SALT, recipient, target, deadline, META);
        _pay(alice, first);
        uint256 rem = c.remaining(GID);
        extra = bound(extra, rem + 1, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.TargetExceeded.selector, extra, rem));
        vm.prank(alice);
        c.contribute(GID, extra, "x");
        assertEq(c.totalCollected(GID), first);
    }

    function testFuzz_NameLengthBoundary(bytes calldata raw) public {
        _create();
        string memory name = string(raw);
        vm.prank(alice);
        if (raw.length > 24) {
            vm.expectRevert(SplitPayGroups.NameTooLong.selector);
            c.contribute(GID, 1, name);
            assertEq(c.totalCollected(GID), 0);
        } else {
            c.contribute(GID, 1, name);
            assertEq(c.totalCollected(GID), 1);
        }
    }

    function testFuzz_DeadlineBoundary(uint64 dl, uint64 offset) public {
        dl = uint64(bound(dl, block.timestamp + 1, type(uint64).max - 1));
        vm.prank(creator);
        c.createGroup(SALT, recipient, TARGET, dl, META);
        offset = uint64(bound(offset, 0, 1_000_000));
        uint256 t = uint256(dl) + offset;
        vm.warp(t);
        vm.prank(alice);
        if (offset == 0) {
            c.contribute(GID, 1, "x");
            assertEq(c.totalCollected(GID), 1);
        } else {
            vm.expectRevert(abi.encodeWithSelector(SplitPayGroups.GroupExpired.selector, GID, dl));
            c.contribute(GID, 1, "x");
        }
    }

    /// @dev Derived id is a pure function of (creator, salt); distinct creators never collide.
    function testFuzz_DerivedIdBoundToCreator(address a, address b, bytes32 salt) public {
        vm.assume(a != b && salt != bytes32(0));
        vm.assume(a != address(0) && b != address(0));
        assertEq(c.groupIdFor(a, salt), keccak256(abi.encode(a, salt)));
        assertTrue(c.groupIdFor(a, salt) != c.groupIdFor(b, salt));
        vm.prank(a);
        bytes32 ida = c.createGroup(salt, recipient, TARGET, deadline, META);
        vm.prank(b);
        bytes32 idb = c.createGroup(salt, alice, TARGET, deadline, META);
        assertTrue(ida != idb);
        (, address ra,,,,) = c.getGroup(ida);
        (, address rb,,,,) = c.getGroup(idb);
        assertEq(ra, recipient);
        assertEq(rb, alice);
    }

    /// @dev The recipient can never contribute, regardless of amount/time-in-window.
    function testFuzz_RecipientNeverContributes(uint256 amount) public {
        _create();
        amount = bound(amount, 1, TARGET);
        usdc.mint(recipient, 1_000e6);
        vm.prank(recipient);
        usdc.approve(address(c), type(uint256).max);
        vm.expectRevert(SplitPayGroups.RecipientCannotContribute.selector);
        vm.prank(recipient);
        c.contribute(GID, amount, "self");
        assertEq(c.totalCollected(GID), 0);
    }
}
