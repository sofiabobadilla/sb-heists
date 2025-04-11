const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const path = require("path");
const fs = require("fs");

describe("attack unchecked_low_level_calls/0x7d09edb07d23acb532a82be3da5c17d9d85806b4.sol", function () {
  let owner, amount;

  async function deployContracts() {
    amount = ethers.parseEther("0.01");
    [owner] = await ethers.getSigners();
    const RevertContract = await ethers.getContractFactory(
      "contracts/unchecked_low_level_calls/0x7d09edb07d23acb532a82be3da5c17d9d85806b4_callee.sol:Whale",
    );
    const revertContract = await RevertContract.deploy();

    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/unchecked_low_level_calls/0x7d09edb07d23acb532a82be3da5c17d9d85806b4.sol/PoCGame.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    const PoCGame = await ethers.getContractFactory(json.abi, json.bytecode);
    const contract = await PoCGame.connect(owner).deploy(
      revertContract.target,
      amount,
    );

    const SuccessContract = await ethers.getContractFactory(
      "contracts/unchecked_low_level_calls/success_contract.sol:SuccessContract",
    );
    const successContract = await SuccessContract.deploy();

    const successPoC = await PoCGame.connect(owner).deploy(
      successContract.target,
      amount,
    );

    return { contract, revertContract, successPoC, successContract };
  }

  it("functional check: unchecked_low_level_calls/0x7d09edb07d23acb532a82be3da5c17d9d85806b4.sol", async function () {
    const { contract,successPoC, successContract,revertContract } = await loadFixture(deployContracts);
    const [v, a] = await ethers.getSigners();
    const donatedValue = await ethers.provider.getStorage(successPoC.target, 8);
    expect(Number(donatedValue)).to.be.equal(0);
    await expect(successPoC.connect(owner).AdjustDifficulty(amount))
      .to.emit(successPoC, "DifficultyChanged")
      .withArgs(amount);
    await successPoC.connect(owner).OpenToThePublic();

    await expect(successPoC.connect(a).wager({ value: amount }))
      .to.emit(successPoC, "Wager")
      .withArgs(amount, a.address);

    expect(await ethers.provider.getBalance(successPoC.target)).to.be.equal(
      amount,
    );
    await expect(successPoC.connect(a).play())
      .to.emit(successPoC, "Lose")
      .withArgs(amount / BigInt(2), a.address);

    expect(await ethers.provider.getBalance(successPoC.target)).to.be.equal(
      amount / BigInt(2),
    );
    expect(
      await ethers.provider.getBalance(successContract.target),
    ).to.be.equal(amount / BigInt(2));
    const donatedValueAfter = await ethers.provider.getStorage(
      successPoC.target,
      8,
    );
    expect(Number(donatedValueAfter)).to.be.equal(amount / BigInt(2));

    // Verify that the contract donateToWhale funtion and loseWager are still calling donate in whale contract

    //Verify for donateToWhale

    // set shouldFail to False  on revertContract
    await revertContract.setShouldFail(false);
    expect(await revertContract.getCallCount()).to.be.equal(0);
    expect(await revertContract.donate()).to.not.be.reverted;


    // Verify revertCOntract call count is 1
    const callCount_before = await revertContract.getCallCount();

    // make the contract opentoublic
    await contract.OpenToThePublic();
    // attempt to donate to whale contract
    await contract.donate({ value: amount });

    // Verify revertCOntract call count is 1
    const callCount_after = await revertContract.getCallCount();
    expect(Number(callCount_after)).to.be.equal(Number(callCount_before) + 1);

    //Verify for loseWager
    // set shouldFail to False on revertContract
    await revertContract.setShouldFail(false);

    // Setup the game properly for testing play()
    // Adjust difficulty if not done yet
    await contract.connect(owner).AdjustDifficulty(amount);

    // Open to public 
    await contract.connect(owner).OpenToThePublic();

    // Place a wager before playing 
    await contract.connect(owner).wager({ value: amount });

    // Get the call count before the play
    const callCount_before_play = await revertContract.getCallCount();

    // Simulate playing the game and verify the emitted event
    await expect(contract.connect(owner).play())
      .to.emit(contract, "Lose")
      .withArgs(amount / BigInt(2), owner.address);

    // Get the call count after the play
    const callCount_after_play = await revertContract.getCallCount();
    expect(Number(callCount_after_play)).to.be.equal(Number(callCount_before_play) + 1);
  });

  it("exploit unchecked low level call vulnerability", async function () {
    const { contract, revertContract } = await loadFixture(deployContracts);
    
    // Set the revertContract to fail on donateToWhale calls
    await revertContract.setShouldFail(true);

    await expect(
      owner.sendTransaction({
        to: revertContract.target,
        value: amount,
      }),
    ).to.be.reverted;

    const donatedValue = await ethers.provider.getStorage(contract.target, 8);
    // Adjust the difficulty of the game and verify the emitted event
    expect(Number(donatedValue)).to.be.equal(0);
    await expect(contract.connect(owner).AdjustDifficulty(amount))
      .to.emit(contract, "DifficultyChanged")
      .withArgs(amount);
    
    // Open to public
    await contract.connect(owner).OpenToThePublic();
    // Place a wager and verify the emitted event
    await expect(contract.connect(owner).wager({ value: amount }))
      .to.emit(contract, "Wager")
      .withArgs(amount, owner.address);
    // Verify the contract's balance after the wager
    expect(await ethers.provider.getBalance(contract.target)).to.be.equal(
      amount,
    );

    // Simulate playing the game and verify the emitted event
    await expect(contract.connect(owner).play())
      .to.emit(contract, "Lose")
      .withArgs(amount / BigInt(2), owner.address);

    // Verify the contract's balance remains unchanged due to the unchecked low-level call vulnerability
    expect(await ethers.provider.getBalance(contract.target)).to.be.equal(
      amount,
    );
    
    expect(await ethers.provider.getBalance(revertContract.target)).to.be.equal(
      0,
    );
    const donatedValueAfter = await ethers.provider.getStorage(
      contract.target,
      8,
    );
    expect(Number(donatedValueAfter)).to.be.equal(amount / BigInt(2));
  });
});
