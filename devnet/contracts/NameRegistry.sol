// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// Unrelated contract used as a control: should NOT look similar to the sweepers.
contract NameRegistry {
    struct Record {
        address owner;
        string target;
        uint64 updatedAt;
    }

    mapping(bytes32 => Record) private records;
    uint256 public count;

    event Registered(bytes32 indexed node, address indexed owner, string target);
    event Released(bytes32 indexed node);

    function register(string calldata label, string calldata target) external {
        bytes32 node = keccak256(bytes(label));
        Record storage r = records[node];
        require(r.owner == address(0) || r.owner == msg.sender, "taken");
        if (r.owner == address(0)) {
            count += 1;
        }
        r.owner = msg.sender;
        r.target = target;
        r.updatedAt = uint64(block.timestamp);
        emit Registered(node, msg.sender, target);
    }

    function release(string calldata label) external {
        bytes32 node = keccak256(bytes(label));
        require(records[node].owner == msg.sender, "not owner");
        delete records[node];
        count -= 1;
        emit Released(node);
    }

    function resolve(string calldata label) external view returns (address owner, string memory target, uint64 updatedAt) {
        Record storage r = records[keccak256(bytes(label))];
        return (r.owner, r.target, r.updatedAt);
    }
}
