import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AIBountyJudgeModule = buildModule("AIBountyJudgeModule", (m) => {
  const bountyJudge = m.contract("AIBountyJudge");

  return { bountyJudge };
});

export default AIBountyJudgeModule;
