// @ts-nocheck
import hhHelpers from "@nomicfoundation/hardhat-network-helpers";
const { loadFixture, time } = hhHelpers;
import { expect } from "chai";
import { describe, it } from "mocha";
import hre from "hardhat";
import { keccak256, encodePacked, toHex, parseEther } from "viem";

describe("AIBountyJudge", function () {
  async function deployAIBountyJudgeFixture() {
    const [owner, participant1, participant2] = await hre.viem.getWalletClients();
    const bountyJudge = await hre.viem.deployContract("AIBountyJudge");
    const publicClient = await hre.viem.getPublicClient();

    return { bountyJudge, owner, participant1, participant2, publicClient };
  }

  describe("Commit-Reveal Flow", function () {
    it("Should successfully process a valid commit and reveal", async function () {
      const { bountyJudge, owner, participant1, publicClient } = await loadFixture(deployAIBountyJudgeFixture);

      // 1. Create Bounty (submission: 1 hour, reveal: 1 hour)
      const submissionDuration = 3600n;
      const revealDuration = 3600n;
      const reward = parseEther("1");

      await bountyJudge.write.createBounty([submissionDuration, revealDuration], {
        value: reward,
      });

      const bountyId = 1n;
      const answer = "The AI is self-aware.";
      const saltStr = "my-secret-salt";
      const salt = keccak256(toHex(saltStr)); // Convert salt to bytes32

      // Calculate commitment: keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
      const commitment = keccak256(
        encodePacked(
          ["string", "bytes32", "address", "uint256"],
          [answer, salt, participant1.account.address, bountyId]
        )
      );

      // 2. Submit Commitment
      const bountyJudgeAsParticipant1 = await hre.viem.getContractAt(
        "AIBountyJudge",
        bountyJudge.address,
        { client: { wallet: participant1 } }
      );

      await bountyJudgeAsParticipant1.write.submitCommitment([bountyId, commitment]);

      // Verify submission state
      const submission = await bountyJudge.read.submissions([bountyId, participant1.account.address]);
      expect(submission[0].toLowerCase()).to.equal(commitment.toLowerCase()); // commitment
      expect(submission[3]).to.be.true; // exists

      // 3. Try to reveal before submission deadline (should fail)
      await expect(
        bountyJudgeAsParticipant1.write.revealAnswer([bountyId, answer, salt])
      ).to.be.rejectedWith("Submission phase is still active");

      // 4. Fast forward time to reveal phase
      await time.increase(3601);

      // 5. Reveal Answer with correct data
      await bountyJudgeAsParticipant1.write.revealAnswer([bountyId, answer, salt]);

      // Verify reveal state
      const revealedSubmission = await bountyJudge.read.submissions([bountyId, participant1.account.address]);
      expect(revealedSubmission[1]).to.equal(answer); // answer
      expect(revealedSubmission[2]).to.be.true; // isRevealed

      const totalRevealed = await bountyJudge.read.bounties([bountyId]);
      expect(totalRevealed[8]).to.equal(1n); // totalRevealed is at index 8
    });

    it("Should reject an invalid reveal (wrong answer or salt)", async function () {
      const { bountyJudge, owner, participant1 } = await loadFixture(deployAIBountyJudgeFixture);

      const submissionDuration = 3600n;
      const revealDuration = 3600n;
      const reward = parseEther("1");

      await bountyJudge.write.createBounty([submissionDuration, revealDuration], {
        value: reward,
      });

      const bountyId = 1n;
      const answer = "Correct answer";
      const salt = keccak256(toHex("secret-salt"));

      const commitment = keccak256(
        encodePacked(
          ["string", "bytes32", "address", "uint256"],
          [answer, salt, participant1.account.address, bountyId]
        )
      );

      const bountyJudgeAsParticipant1 = await hre.viem.getContractAt(
        "AIBountyJudge",
        bountyJudge.address,
        { client: { wallet: participant1 } }
      );

      await bountyJudgeAsParticipant1.write.submitCommitment([bountyId, commitment]);

      // Fast forward to reveal phase
      await time.increase(3601);

      // Try to reveal with wrong answer
      await expect(
        bountyJudgeAsParticipant1.write.revealAnswer([bountyId, "Wrong answer", salt])
      ).to.be.rejectedWith("Hash mismatch");

      // Try to reveal with wrong salt
      const wrongSalt = keccak256(toHex("wrong-salt"));
      await expect(
        bountyJudgeAsParticipant1.write.revealAnswer([bountyId, answer, wrongSalt])
      ).to.be.rejectedWith("Hash mismatch");
    });
  });
});
