const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { getContractAddress } = require("@ethersproject/address");
const path = require("path");
const fs = require("fs");

describe("attack access_control/proxy.sol", function () {
  let victim_sig, attacker_sig, amount;
  async function deployContracts() {
    const [v, a] = await ethers.getSigners();
    victim_sig = v;
    attacker_sig = a;
    const victimNonce = (await victim_sig.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: victim_sig.address,
      nonce: victimNonce,
    });

    amount = ethers.parseEther("1.0");
    await victim_sig.sendTransaction({
      to: futureAddress,
      value: amount,
    });

    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/access_control/proxy.sol/Proxy.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    const Proxy = await ethers.getContractFactory(json.abi, json.bytecode);
    const victim = await Proxy.deploy();
    await victim.waitForDeployment();
    const address = await victim.getAddress();

    const ProxyAttacker = await ethers.getContractFactory(
      "contracts/access_control/proxy_attack.sol:ProxyAttacker",
    );
    const attacker = await ProxyAttacker.deploy(address);
    await attacker.waitForDeployment();
    return { victim, attacker };
  }

  it("functional check: access_control/proxy.sol", async function () {
    const { victim, attacker } = await loadFixture(deployContracts);

    const attackerInterface = new ethers.Interface(["function benign()"]);

    const data = attackerInterface.encodeFunctionData("benign");
    await expect(victim.forward(attacker.target, data)).to.not.be.reverted;
  });

  it("exploit access control vulnerability", async function () {
    const { victim, attacker } = await loadFixture(deployContracts);
    const victim_addr = await victim.getAddress();
    const attacker_addr = await attacker.getAddress();

    const victimeBalanceBefore = await ethers.provider.getBalance(victim_addr);
    expect(victimeBalanceBefore).to.equal(amount);
    const attackerBalanceBefore =
      await ethers.provider.getBalance(attacker_addr);
    expect(attackerBalanceBefore).to.equal(0);

    await attacker.attack();
    const victimBalanceAfter = await ethers.provider.getBalance(victim_addr);
    expect(victimBalanceAfter).to.equal(0);
    const attackerBalanceAfter =
      await ethers.provider.getBalance(attacker_addr);
    expect(attackerBalanceAfter).to.equal(amount);
  });
});
