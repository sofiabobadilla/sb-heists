pragma solidity ^0.4.24;

contract Whale {
    bool public shouldFail = false;
    uint256 public callCount = 0;
    
    // Function to control test behavior
    function setShouldFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }
    
    // Mock of the donate function that can be configured to fail
    function donate() external payable {
        callCount++;
        if (shouldFail) {
            revert("Donation failed");
        }
        // Otherwise, accept the donation
    }
    
    // Helper to check if donate was called
    function getCallCount() external view returns (uint256) {
        return callCount;
    }
}