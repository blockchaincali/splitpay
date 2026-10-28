// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SplitPayGroups} from "../../SplitPayGroups.sol";

/// @dev transferFrom returns false instead of reverting.
contract ReturnsFalseToken is ERC20 {
    constructor() ERC20("False", "FALSE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @dev transferFrom always reverts.
contract RevertingToken is ERC20 {
    error TransferFromReverted();

    constructor() ERC20("Revert", "REV") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert TransferFromReverted();
    }
}

/// @dev Reverts on any movement to a blocklisted recipient (USDC-style blocklist).
contract BlocklistToken is ERC20 {
    error RecipientBlocklisted(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("Blocklist", "BLK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[to]) revert RecipientBlocklisted(to);
        super._update(from, to, value);
    }
}

interface ITokenHook {
    function onTokenReceived(address from, uint256 amount) external;
}

/// @dev ERC-777-style token: after balances move, calls a hook on contract recipients.
contract ReentrantToken is ERC20 {
    constructor() ERC20("Reentrant", "RE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to.code.length > 0) {
            ITokenHook(to).onTokenReceived(from, value);
        }
    }
}

/// @dev Recipient whose token hook tries to re-enter contribute and createGroup.
contract ReentrantRecipient is ITokenHook {
    SplitPayGroups public target;
    bytes32 public reenterGroupId;
    bytes32 public newGroupId;
    uint256 public reenterAmount;
    /// @dev When true, a failed re-entry bubbles up and aborts the outer transfer.
    bool public bubble;
    bool public attackContribute;
    bool public attackCreate;

    bool public contributeAttempted;
    bool public contributeSucceeded;
    bytes public contributeRevertData;
    bool public createAttempted;
    bool public createSucceeded;
    bytes public createRevertData;

    function configure(
        SplitPayGroups target_,
        bytes32 reenterGroupId_,
        uint256 reenterAmount_,
        bytes32 newGroupId_,
        bool attackContribute_,
        bool attackCreate_,
        bool bubble_
    ) external {
        target = target_;
        reenterGroupId = reenterGroupId_;
        reenterAmount = reenterAmount_;
        newGroupId = newGroupId_;
        attackContribute = attackContribute_;
        attackCreate = attackCreate_;
        bubble = bubble_;
    }

    function approveTarget(address token) external {
        ERC20(token).approve(address(target), type(uint256).max);
    }

    function onTokenReceived(address, uint256) external {
        if (attackContribute) {
            contributeAttempted = true;
            try target.contribute(reenterGroupId, reenterAmount, "reenter") {
                contributeSucceeded = true;
            } catch (bytes memory data) {
                contributeRevertData = data;
                if (bubble) {
                    assembly {
                        revert(add(data, 32), mload(data))
                    }
                }
            }
        }
        if (attackCreate) {
            createAttempted = true;
            try target.createGroup(
                newGroupId, address(0xBEEF), 50e6, uint64(block.timestamp + 1 days), bytes32(0)
            ) {
                createSucceeded = true;
            } catch (bytes memory data) {
                createRevertData = data;
                if (bubble) {
                    assembly {
                        revert(add(data, 32), mload(data))
                    }
                }
            }
        }
    }
}
