// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SplitPayGroups
/// @notice Permissionless, non-custodial group payments sent directly to each recipient.
/// @dev Arc USDC's ERC-20 interface uses 6 decimals at
/// 0x3600000000000000000000000000000000000000. All amounts are 6-decimal
/// ERC-20 units, never 18-decimal native gas units. The constructor does not
/// query decimals(). This contract never uses msg.value: it has no payable
/// functions and no receive or fallback function. There are no group setters.
/// Known limitation: the recipient is immutable and is not checked against the
/// USDC blocklist, so a recipient that USDC refuses to pay makes every
/// contribution revert (no funds are ever held); create a new group instead.
contract SplitPayGroups is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_NAME_BYTES = 24;
    IERC20 public immutable usdc;

    struct Group {
        address creator;
        address recipient;
        uint64 deadline;
        uint256 target;
        uint256 collected;
        bytes32 metadataHash;
        bool exists;
    }

    mapping(bytes32 => Group) private _groups;
    mapping(bytes32 => mapping(address => uint256)) private _contributed;

    error InvalidToken();
    error InvalidSalt();
    error GroupAlreadyExists();
    error InvalidRecipient();
    error InvalidTarget();
    error InvalidDeadline();
    error GroupNotFound();
    error GroupExpired(bytes32 groupId, uint64 deadline);
    error InvalidAmount();
    error TargetExceeded(uint256 requested, uint256 remaining);
    error NameTooLong();
    error RecipientCannotContribute();

    event GroupCreated(
        bytes32 indexed groupId,
        address indexed creator,
        address indexed recipient,
        uint256 target,
        uint64 deadline,
        bytes32 metadataHash
    );

    event ContributionReceived(
        bytes32 indexed groupId,
        address indexed contributor,
        uint256 amount,
        uint256 totalCollected,
        string name
    );

    /// @param usdc_ USDC ERC-20 interface; must not be the zero address.
    constructor(IERC20 usdc_) {
        if (address(usdc_) == address(0)) revert InvalidToken();
        usdc = usdc_;
    }

    /// @notice Create a group whose payment terms cannot subsequently change.
    /// @dev The group id is `groupIdFor(msg.sender, salt)`. Binding the id to the
    /// creator means nobody else can register, front-run or squat an id that
    /// another creator has chosen or shared.
    /// @param salt Creator-chosen nonzero value that makes the id unique per creator.
    /// @param recipient Address receiving every contribution directly.
    /// @param target Maximum total contributions in 6-decimal ERC-20 units.
    /// @param deadline Last Unix timestamp (inclusive) at which contributions are accepted.
    /// @param metadataHash Commitment to off-chain group metadata.
    /// @return groupId The id of the newly created group.
    function createGroup(
        bytes32 salt,
        address recipient,
        uint256 target,
        uint64 deadline,
        bytes32 metadataHash
    ) external returns (bytes32 groupId) {
        if (salt == bytes32(0)) revert InvalidSalt();
        groupId = groupIdFor(msg.sender, salt);
        if (_groups[groupId].exists) revert GroupAlreadyExists();
        if (
            recipient == address(0) || recipient == address(this)
                || recipient == address(usdc)
        ) revert InvalidRecipient();
        if (target == 0) revert InvalidTarget();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        _groups[groupId] = Group({
            creator: msg.sender,
            recipient: recipient,
            deadline: deadline,
            target: target,
            collected: 0,
            metadataHash: metadataHash,
            exists: true
        });

        emit GroupCreated(groupId, msg.sender, recipient, target, deadline, metadataHash);
    }

    /// @notice Send USDC directly from the caller to the group's recipient.
    /// @dev Requires prior token allowance. Failed transfers revert all accounting.
    /// Contributions are accepted at the deadline second, but never after it.
    /// @param groupId Existing group identifier.
    /// @param amount Exact amount to pull, in 6-decimal ERC-20 units.
    /// @param name Public event label of at most 24 UTF-8 bytes, not characters.
    function contribute(bytes32 groupId, uint256 amount, string calldata name)
        external
        nonReentrant
    {
        Group storage group = _groups[groupId];
        if (!group.exists) revert GroupNotFound();
        if (block.timestamp > group.deadline) revert GroupExpired(groupId, group.deadline);
        if (amount == 0) revert InvalidAmount();
        // A recipient paying themselves would inflate "collected" with no new money.
        if (msg.sender == group.recipient) revert RecipientCannotContribute();
        uint256 open = group.target - group.collected;
        if (amount > open) revert TargetExceeded(amount, open);
        if (bytes(name).length > MAX_NAME_BYTES) revert NameTooLong();

        group.collected += amount;
        _contributed[groupId][msg.sender] += amount;

        usdc.safeTransferFrom(msg.sender, group.recipient, amount);

        emit ContributionReceived(groupId, msg.sender, amount, group.collected, name);
    }

    /// @notice Return the immutable terms and current accounting of an existing group.
    function getGroup(bytes32 groupId)
        external
        view
        returns (
            address creator,
            address recipient,
            uint256 target,
            uint64 deadline,
            uint256 collected,
            bytes32 metadataHash
        )
    {
        Group storage group = _groups[groupId];
        if (!group.exists) revert GroupNotFound();
        return (
            group.creator,
            group.recipient,
            group.target,
            group.deadline,
            group.collected,
            group.metadataHash
        );
    }

    /// @notice The group id that `creator` obtains by calling createGroup with `salt`.
    function groupIdFor(address creator, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, salt));
    }

    /// @notice Whether a group has been created.
    function groupExists(bytes32 groupId) external view returns (bool) {
        return _groups[groupId].exists;
    }

    /// @notice Total contributed by a wallet; zero for missing groups or contributions.
    function contributionOf(bytes32 groupId, address wallet) external view returns (uint256) {
        return _contributed[groupId][wallet];
    }

    /// @notice Total contributions to an existing group, in 6-decimal ERC-20 units.
    function totalCollected(bytes32 groupId) external view returns (uint256) {
        Group storage group = _groups[groupId];
        if (!group.exists) revert GroupNotFound();
        return group.collected;
    }

    /// @notice Unfilled target of an existing group, even after its deadline.
    function remaining(bytes32 groupId) external view returns (uint256) {
        Group storage group = _groups[groupId];
        if (!group.exists) revert GroupNotFound();
        return group.target - group.collected;
    }
}
