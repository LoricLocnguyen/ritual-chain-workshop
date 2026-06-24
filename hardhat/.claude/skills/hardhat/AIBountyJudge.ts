/// <reference types="mocha" />
/// <reference types="hardhat" />
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AIBountyJudge - Commit-Reveal Test Suite", function () {
  async function deployBountyJudgeFixture() {
    const [owner, participantA, participantB] = await ethers.getSigners();
    const AIBountyJudge = await ethers.getContractFactory("AIBountyJudge");
    const bountyJudge = await AIBountyJudge.deploy();
    return { bountyJudge, owner, participantA, participantB };
  }

  it("Should successfully create a bounty, submit a commitment, reveal the answer, and award the winner", async function () {
    const { bountyJudge, owner, participantA } = await deployBountyJudgeFixture();

    // 1. Create Bounty (Submission duration: 100s, Reveal duration: 100s)
    await bountyJudge.createBounty(100, 100, { value: ethers.parseEther("1") });

    // 2. Prepare submission data for Participant A
    const bountyId = 1;
    const answer = "Secure solution for the Ritual AI Bounty";
    const salt = ethers.encodeBytes32String("secure_salt_123");
    
    // Calculate commitment hash: keccak256(answer, salt, sender, bountyId)
    const commitment = ethers.solidityPackedKeccak256(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, participantA.address, bountyId]
    );

    // Participant A submits commitment during the Submission phase
    await bountyJudge.connect(participantA).submitCommitment(bountyId, commitment);

    // 3. Fast-forward past the submission deadline to enter the Reveal phase
    await time.increase(101);

    // Participant A reveals the actual answer and salt
    await bountyJudge.connect(participantA).revealAnswer(bountyId, answer, salt);

    // 4. Fast-forward past the reveal deadline to enter the Judging phase
    await time.increase(101);

    // Owner requests batch judging from Ritual AI
    await bountyJudge.connect(owner).judgeAll(bountyId, ethers.toBeavyBytes("0x"));

    // Owner finalizes the winner (Participant A at index 0) and verifies the reward transfer
    await expect(bountyJudge.connect(owner).finalizeWinner(bountyId, 0))
      .to.changeEtherBalance(participantA, ethers.parseEther("1"));
  });

  it("Should reject commitment if the submission phase has ended", async function () {
    const { bountyJudge, participantA } = await deployBountyJudgeFixture();
    await bountyJudge.createBounty(100, 100, { value: ethers.parseEther("1") });

    // Fast-forward past the submission deadline
    await time.increase(150);

    const commitment = ethers.zeroPadValue("0x01", 32);
    await expect(
      bountyJudge.connect(participantA).submitCommitment(1, commitment)
    ).to.be.revertedWith("Submission phase has ended");
  });

  it("Should prevent front-running or answer copying via hash validation", async function () {
    const { bountyJudge, participantA, participantB } = await deployBountyJudgeFixture();
    await bountyJudge.createBounty(100, 100, { value: ethers.parseEther("1") });

    const bountyId = 1;
    const answer = "Unique solution format";
    const salt = ethers.encodeBytes32String("salt");

    // Participant A submits a valid commitment
    const commitmentA = ethers.solidityPackedKeccak256(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, participantA.address, bountyId]
    );
    await bountyJudge.connect(participantA).submitCommitment(bountyId, commitmentA);

    await time.increase(101);

    // Participant B tries to copy A's answer and salt to reveal it for themselves
    // This will revert because msg.sender (Participant B) causes an on-chain hash mismatch
    await expect(
      bountyJudge.connect(participantB).revealAnswer(bountyId, answer, salt)
    ).to.be.revertedWith("Hash mismatch");
  });
});