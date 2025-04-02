const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const path = require("path");
const fs = require("fs");

describe("attack arithmetic/integer_overflow_minimal.sol", function () {
  async function deployContracts() {
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/arithmetic/integer_overflow_minimal.sol/IntegerOverflowMinimal.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    const IntegerOverflowAdd = await ethers.getContractFactory(
      json.abi,
      json.bytecode,
    );
    const victim = await IntegerOverflowAdd.deploy();
    await victim.waitForDeployment();
    const address = await victim.getAddress();

    const IntegerOverflowMinimalAttacker = await ethers.getContractFactory(
      "contracts/arithmetic/integer_overflow_minimal_attack.sol:IntegerOverflowMinimalAttacker",
    );
    const attacker = await IntegerOverflowMinimalAttacker.deploy(address);
    await attacker.waitForDeployment();
    return { victim, attacker };
  }

  it("functional check: arithmetic/integer_overflow_benign_1.sol", async function () {
    const { victim } = await loadFixture(deployContracts);
    const [v, a] = await ethers.getSigners();
    // oracle: initial value is 1 for count
    expect(await victim.count()).to.equal(1);
    // oracle: run(0) will increase count by 1
    await victim.connect(a).run(0);
    expect(await victim.count()).to.equal(1);
  });

  it("exploit underflow vulnerability", async function () {
    const { victim, attacker } = await loadFixture(deployContracts);
    expect(await victim.count()).to.equal(1);
    await victim.run(1);
    expect(await victim.count()).to.equal(0);
    await attacker.attack();
    expect(await victim.count()).to.greaterThan(0);
  });
});
