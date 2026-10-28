// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

abstract contract SplitPayGroupsTestBase is Test {
    SplitPayGroups internal c;
    MockUSDC internal usdc;

    address internal creator = makeAddr("creator");
    address internal recipient = makeAddr("recipient");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant SALT = keccak256("group-1");
    bytes32 internal constant META = keccak256("meta");
    uint256 internal constant TARGET = 100e6;
    uint64 internal deadline;
    /// @dev Derived id of the group `creator` makes with SALT.
    bytes32 internal GID;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        deadline = uint64(block.timestamp + 7 days);
        usdc = new MockUSDC();
        c = new SplitPayGroups(IERC20(address(usdc)));
        GID = keccak256(abi.encode(creator, SALT));
        _fund(alice);
        _fund(bob);
        _fund(carol);
    }

    function _fund(address who) internal {
        usdc.mint(who, 1_000e6);
        vm.prank(who);
        usdc.approve(address(c), type(uint256).max);
    }

    function _create() internal {
        vm.prank(creator);
        c.createGroup(SALT, recipient, TARGET, deadline, META);
    }

    function _pay(address who, uint256 amount) internal {
        vm.prank(who);
        c.contribute(GID, amount, "n");
    }
}
