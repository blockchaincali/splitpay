// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SplitPayGroups} from "../SplitPayGroups.sol";

/// @notice Deploys SplitPayGroups against the USDC ERC-20 interface given in USDC_ADDRESS.
/// @dev Sign with a Foundry keystore (`--account <name>`) or a hardware wallet; never pass a raw private key.
///   forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
///     --rpc-url "$RPC_URL" --account "$KEYSTORE_NAME" --broadcast
contract DeploySplitPayGroups is Script {
    function run() external returns (SplitPayGroups deployed) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        require(usdc != address(0), "USDC_ADDRESS not set");
        vm.startBroadcast();
        deployed = new SplitPayGroups(IERC20(usdc));
        vm.stopBroadcast();
    }
}
