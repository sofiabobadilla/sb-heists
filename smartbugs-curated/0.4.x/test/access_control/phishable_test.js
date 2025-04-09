const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

describe("attack access_control/phishable.sol", function () {
  let victim_sig;
  let attacker_sig;
  async function deployContracts() {
    const [v, a] = await ethers.getSigners();
    victim_sig = v;
    attacker_sig = a;
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/access_control/phishable.sol/Phishable.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    const Phishable = await ethers.getContractFactory(json.abi, json.bytecode);
    const victim = await Phishable.deploy(victim_sig.address);
    await victim.waitForDeployment();
    const address = await victim.getAddress();

    const PhishableAttacker = await ethers.getContractFactory(
      "contracts/access_control/phishable_attack.sol:PhishableAttacker",
    );
    const attacker = await PhishableAttacker.deploy(
      address,
      attacker_sig.address,
    );
    await attacker.waitForDeployment();
    return { victim, attacker };
  }

  it("functional check: access_control/phishable.sol", async function () {
    const { victim } = await loadFixture(deployContracts);
    const [v, a] = await ethers.getSigners();
    const amount = ethers.parseEther("1.0");
    await a.sendTransaction({
      to: victim.target,
      value: amount,
    });
    expect(await ethers.provider.getBalance(victim.target)).to.equal(amount);

    // oracle: check if withdrawAll works for a benign case
    const balanceBefore = await ethers.provider.getBalance(victim_sig.address);
    const tx = await victim.withdrawAll(victim_sig.address);
    const receipt = await tx.wait();
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    expect(await ethers.provider.getBalance(victim.target)).to.equal(0);
    expect(await ethers.provider.getBalance(victim_sig.address)).to.equal(
      balanceBefore + amount - gasFee,
    );

    // oracle: check that withdrawAll will revert if directly called by the attacker
    await expect(
      victim.connect(attacker_sig).withdrawAll(attacker_sig.address),
    ).to.be.reverted;


  });

  it("exploit access control vulnerability", async function () {
    const { victim, attacker } = await loadFixture(deployContracts);
    const amount = ethers.parseEther("1.0");
    const victim_addr = await victim.getAddress();
    const attacker_addr = await attacker.getAddress();
    await victim_sig.sendTransaction({
      to: victim_addr,
      value: amount,
    });


    const victimBalanceBefore = await ethers.provider.getBalance(victim_addr);
    const attackerBalanceBefore = await ethers.provider.getBalance(
      attacker_sig.address,
    );

    expect(victimBalanceBefore).to.equal(amount);

    const small_amount = ethers.parseUnits("1", "wei");

    // oracle: the victim falls into a phishing transaction. The fallback of attacker runs a withdrawAll
    await victim_sig.sendTransaction({
      to: attacker_addr,
      value: small_amount,
    });

    const victimBalanceAfter = await ethers.provider.getBalance(victim_addr);
    expect(victimBalanceAfter).to.equal(0);

    const attackerBalanceAfter = await ethers.provider.getBalance(
      attacker_sig.address,
    );
    // not sure about this check
    expect(attackerBalanceAfter - attackerBalanceBefore).to.not.equal(
      small_amount,
    );
    // attacker should have gotten the victim's funds
    expect(attackerBalanceAfter - attackerBalanceBefore).to.equal(amount);
  });
});
