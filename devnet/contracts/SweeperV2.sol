// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// A modified sweeper: same forwarding core plus a skim fee and a way to rotate
/// the collector. Not a byte-for-byte clone, but a close relative.
contract SweeperV2 {
    address public collector;
    address public operator;
    uint256 public swept;
    uint256 public feeBps = 250;

    event Swept(address indexed from, uint256 amount);
    event CollectorChanged(address indexed collector);

    constructor(address collector_) {
        collector = collector_;
        operator = msg.sender;
    }

    receive() external payable {
        swept += msg.value;
        uint256 fee = (msg.value * feeBps) / 10_000;
        (bool ok, ) = collector.call{value: msg.value - fee}("");
        require(ok, "forward failed");
        emit Swept(msg.sender, msg.value);
    }

    function sweep() external {
        uint256 amount = address(this).balance;
        (bool ok, ) = collector.call{value: amount}("");
        require(ok, "sweep failed");
    }

    function setCollector(address next) external {
        require(msg.sender == operator, "operator only");
        collector = next;
        emit CollectorChanged(next);
    }
}
