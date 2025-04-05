const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
describe("Reentrancy Attack for reentrancy_dao.sol", function () {
  let ReentrancyDAO;
  let victim;
  let MaliciousContract;
  let hacker;

  beforeEach(async function () {
    // Deploy Log contract

    // Deploy EtherStore contract with Log address
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/reentrancy/reentrancy_dao.sol/ReentrancyDAO.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    ReentrancyDAO = await ethers.getContractFactory(json.abi, json.bytecode);
    victim = await ReentrancyDAO.deploy();
    await victim.waitForDeployment();
    //await victim.setLog(log.target); // Set Log address after deployment

    // Deploy MaliciousContract with ReentrancyDAO address
    MaliciousContract = await ethers.getContractFactory(
      "contracts/reentrancy/reentrancy_dao_attack.sol:MaliciousContract",
    );
    hacker = await MaliciousContract.deploy(victim.target);
  });

  it("functional check: reentrancy/reentrancy_dao.sol", async function () {
    const [v, a] = await ethers.getSigners();
    //oracle: verify that deposit on ReentrancyDAO works as expected
    const amount = ethers.parseEther("1");
    await expect(victim.connect(a).deposit({ value: amount })).to.not.be
      .reverted;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);
    const balanceBefore = await ethers.provider.getBalance(a.address);
    //oracle: verify that withdrawAll on ReentrancyDAO works as expected
    const tx = await victim.connect(a).withdrawAll();
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    // Check if the balance of the attacker is updated correctly
    expect(await ethers.provider.getBalance(a.address)).to.equal(
      balanceBefore + amount - gasFee,
    );
  });

  it("should successfully drain funds through reentrancy attack", async function () {
    // Initial deposit to victim contract
    await victim.deposit({ value: ethers.parseEther("5") });

    const victimInitialBalance = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimInitialBalance).to.equal(ethers.parseEther("5"));

    // Initial deposit from hacker on victim contract
    await hacker.deposit({ value: ethers.parseEther("1") });

    const victimBalanceAfterDeposit = await ethers.provider.getBalance(
      victim.target,
    );
    expect(victimBalanceAfterDeposit).to.equal(ethers.parseEther("6"));

    // Set hacker balance to 0
    await network.provider.send("hardhat_setBalance", [hacker.target, "0x0"]);
    let hackerBalance = await ethers.provider.getBalance(hacker.target);
    expect(hackerBalance).to.equal(0);

    // Perform reentrancy attack through MaliciousContract
    await hacker.attack({ gasLimit: 30000000 });

    // Check balances after attack
    const victimBalance = await ethers.provider.getBalance(victim.target);
    hackerBalance = await ethers.provider.getBalance(hacker.target);

    // Verify the attack was successful

    // victim has les money than expected
    expect(victimBalance).to.be.below(ethers.parseEther("5"));

    // hacker has more than the initial withdrawal
    expect(hackerBalance).to.be.above(ethers.parseEther("1"));
  });
});
