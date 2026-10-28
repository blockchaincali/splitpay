// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SplitPayHandler is Test {
    SplitPayGroups public c;
    MockUSDC public usdc;

    uint256 public constant GROUPS = 3;
    bytes32[GROUPS] public ids;
    address[GROUPS] public recipients;
    address[4] public wallets;
    uint256[GROUPS] public targets;
    uint256[GROUPS] public ghostCollected;
    /// @dev USDC minted straight to recipients so their own contribute attempts are funded.
    uint256[GROUPS] public ghostSelfFunded;

    constructor(SplitPayGroups c_, MockUSDC usdc_) {
        c = c_;
        usdc = usdc_;
        for (uint256 i; i < 4; ++i) {
            wallets[i] = makeAddr(string.concat("wallet", vm.toString(i)));
            usdc.mint(wallets[i], type(uint96).max);
            vm.prank(wallets[i]);
            usdc.approve(address(c), type(uint256).max);
        }
        for (uint256 i; i < GROUPS; ++i) {
            recipients[i] = makeAddr(string.concat("rcpt", vm.toString(i)));
            targets[i] = (i + 1) * 1_000e6;
            ids[i] = c.createGroup(
                keccak256(abi.encode("g", i)), recipients[i], targets[i], uint64(block.timestamp + 30 days), bytes32(0)
            );
        }
    }

    function contribute(uint256 gSeed, uint256 wSeed, uint256 amount) external {
        uint256 g = gSeed % GROUPS;
        uint256 rem = c.remaining(ids[g]);
        if (rem == 0) return;
        // Mostly valid amounts, occasionally an overpayment that must revert.
        amount = bound(amount, 1, rem + (amount % 7 == 0 ? 5 : 0));
        vm.prank(wallets[wSeed % 4]);
        try c.contribute(ids[g], amount, "h") {
            ghostCollected[g] += amount;
        } catch {}
    }

    /// @dev Recipients try to pay their own group; must always revert with no effect.
    function recipientContributes(uint256 gSeed, uint256 amount) external {
        uint256 g = gSeed % GROUPS;
        amount = bound(amount, 1, targets[g]);
        usdc.mint(recipients[g], amount);
        ghostSelfFunded[g] += amount;
        vm.startPrank(recipients[g]);
        usdc.approve(address(c), type(uint256).max);
        try c.contribute(ids[g], amount, "self") {
            ghostCollected[g] += amount; // would break the invariants if it ever succeeded
        } catch {}
        vm.stopPrank();
    }

    function createExtraGroup(uint256 idSeed, uint256 target) external {
        target = bound(target, 1, 1e12);
        try c.createGroup(
            keccak256(abi.encode("x", idSeed % 8)), makeAddr("xr"), target, uint64(block.timestamp + 1 days), 0
        ) {} catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 2 days));
    }

    function sumRecipientBalances() external view returns (uint256 s) {
        for (uint256 i; i < GROUPS; ++i) s += usdc.balanceOf(recipients[i]) - ghostSelfFunded[i];
    }

    function sumGhost() external view returns (uint256 s) {
        for (uint256 i; i < GROUPS; ++i) s += ghostCollected[i];
    }
}

contract SplitPayGroupsInvariantTest is StdInvariant, Test {
    SplitPayGroups internal c;
    MockUSDC internal usdc;
    SplitPayHandler internal h;

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        c = new SplitPayGroups(IERC20(address(usdc)));
        h = new SplitPayHandler(c, usdc);
        targetContract(address(h));
    }

    function invariant_ContractUsdcBalanceIsZero() public view {
        assertEq(usdc.balanceOf(address(c)), 0);
        assertEq(address(c).balance, 0);
    }

    function invariant_CollectedNeverExceedsTarget() public view {
        for (uint256 i; i < h.GROUPS(); ++i) {
            bytes32 id = h.ids(i);
            assertLe(c.totalCollected(id), h.targets(i));
            assertEq(c.remaining(id), h.targets(i) - c.totalCollected(id));
        }
    }

    function invariant_RecipientBalancesEqualCollected() public view {
        uint256 s;
        for (uint256 i; i < h.GROUPS(); ++i) {
            assertEq(c.totalCollected(h.ids(i)), h.ghostCollected(i));
            assertEq(usdc.balanceOf(h.recipients(i)), c.totalCollected(h.ids(i)) + h.ghostSelfFunded(i));
            s += c.totalCollected(h.ids(i));
        }
        assertEq(h.sumRecipientBalances(), s);
    }

    function invariant_RecipientsNeverRecordedAsContributors() public view {
        for (uint256 i; i < h.GROUPS(); ++i) {
            assertEq(c.contributionOf(h.ids(i), h.recipients(i)), 0);
        }
    }

    function invariant_WalletContributionsSumToCollected() public view {
        for (uint256 i; i < h.GROUPS(); ++i) {
            uint256 s;
            for (uint256 w; w < 4; ++w) s += c.contributionOf(h.ids(i), h.wallets(w));
            assertEq(s, c.totalCollected(h.ids(i)));
        }
    }
}
