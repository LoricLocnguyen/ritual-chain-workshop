// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

contract AIBountyJudge is PrecompileConsumer {
    struct Bounty {
        address owner;
        uint256 reward;
        uint256 submissionDeadline;
        uint256 revealDeadline;
        bool judged;
        bool finalized;
        uint256 winnerIndex;
        address winner;
        uint256 totalRevealed;
    }

    struct Submission {
        bytes32 commitment;
        string answer;
        bool isRevealed;
        bool exists;
    }

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) public bounties;
    
    // bountyId => participant => Submission
    mapping(uint256 => mapping(address => Submission)) public submissions;
    
    // bountyId => mảng lưu địa chỉ các user đã reveal hợp lệ
    mapping(uint256 => address[]) public eligibleParticipants;

    event BountyCreated(uint256 indexed bountyId, address indexed owner, uint256 reward);
    event CommitmentSubmitted(uint256 indexed bountyId, address indexed participant, bytes32 commitment);
    event AnswerRevealed(uint256 indexed bountyId, address indexed participant, string answer);
    event JudgingRequested(uint256 indexed bountyId, bytes llmInput);
    event WinnerFinalized(uint256 indexed bountyId, address indexed winner, uint256 reward);

    modifier onlyOwner(uint256 _bountyId) {
        require(msg.sender == bounties[_bountyId].owner, "Not the bounty owner");
        _;
    }

    // 1. Tạo Bounty với thời gian nộp và thời gian reveal
    function createBounty(uint256 _submissionDuration, uint256 _revealDuration) external payable {
        require(msg.value > 0, "Reward must be greater than 0");

        uint256 bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            owner: msg.sender,
            reward: msg.value,
            submissionDeadline: block.timestamp + _submissionDuration,
            revealDeadline: block.timestamp + _submissionDuration + _revealDuration,
            judged: false,
            finalized: false,
            winnerIndex: 0,
            winner: address(0),
            totalRevealed: 0
        });

        emit BountyCreated(bountyId, msg.sender, msg.value);
    }

    // 2. Nộp commitment hash trong pha submission
    function submitCommitment(uint256 _bountyId, bytes32 _commitment) external {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.owner != address(0), "Bounty does not exist");
        require(block.timestamp < bounty.submissionDeadline, "Submission phase has ended");
        require(!submissions[_bountyId][msg.sender].exists, "Already submitted a commitment");
        require(_commitment != bytes32(0), "Invalid commitment");

        submissions[_bountyId][msg.sender] = Submission({
            commitment: _commitment,
            answer: "",
            isRevealed: false,
            exists: true
        });

        emit CommitmentSubmitted(_bountyId, msg.sender, _commitment);
    }

    // 3. Reveal câu trả lời và salt trong pha reveal
    function revealAnswer(
        uint256 _bountyId,
        string calldata _answer,
        bytes32 _salt
    ) external {
        Bounty storage bounty = bounties[_bountyId];
        require(block.timestamp >= bounty.submissionDeadline, "Submission phase is still active");
        require(block.timestamp < bounty.revealDeadline, "Reveal phase has ended");
        
        Submission storage sub = submissions[_bountyId][msg.sender];
        require(sub.exists, "No commitment found");
        require(!sub.isRevealed, "Already revealed");

        // Kiểm tra khớp hash keccak256(answer, salt, sender, bountyId)
        bytes32 expectedCommitment = keccak256(abi.encodePacked(_answer, _salt, msg.sender, _bountyId));
        require(sub.commitment == expectedCommitment, "Hash mismatch");

        sub.answer = _answer;
        sub.isRevealed = true;
        
        eligibleParticipants[_bountyId].push(msg.sender);
        bounty.totalRevealed++;

        emit AnswerRevealed(_bountyId, msg.sender, _answer);
    }

    // 4. Gọi Ritual AI chấm điểm hàng loạt (Batch Judging)
    function judgeAll(uint256 _bountyId, bytes calldata _llmInput) external onlyOwner(_bountyId) {
        Bounty storage bounty = bounties[_bountyId];
        require(block.timestamp >= bounty.revealDeadline, "Reveal phase is still active");
        require(!bounty.judged, "Already judged");
        require(bounty.totalRevealed > 0, "No answers to judge");

        bounty.judged = true;
        emit JudgingRequested(_bountyId, _llmInput);
    }

    // 5. Chốt người chiến thắng và trao giải
    function finalizeWinner(uint256 _bountyId, uint256 _winnerIndex) external onlyOwner(_bountyId) {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.judged, "Not judged yet");
        require(!bounty.finalized, "Already finalized");
        require(_winnerIndex < eligibleParticipants[_bountyId].length, "Invalid winner index");

        address winnerAddress = eligibleParticipants[_bountyId][_winnerIndex];
        bounty.winnerIndex = _winnerIndex;
        bounty.winner = winnerAddress;
        bounty.finalized = true;

        uint256 rewardAmount = bounty.reward;
        bounty.reward = 0;
        payable(winnerAddress).transfer(rewardAmount);

        emit WinnerFinalized(_bountyId, winnerAddress, rewardAmount);
    }

    // Helper để lấy danh sách bài thi phục vụ Ritual off-chain node
    function getRevealedSubmissions(uint256 _bountyId) external view returns (address[] memory users, string[] memory answers) {
        uint256 count = eligibleParticipants[_bountyId].length;
        users = new address[](count);
        answers = new string[](count);

        for (uint256 i = 0; i < count; i++) {
            address user = eligibleParticipants[_bountyId][i];
            users[i] = user;
            answers[i] = submissions[_bountyId][user].answer;
        }
        return (users, answers);
    }
}