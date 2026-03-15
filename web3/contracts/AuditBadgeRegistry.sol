// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AuditBadgeRegistry
/// @notice Issues NFT-style audit compliance badges linked to anchored case proofs.
/// @dev Soulbound-style registry (non-transferable by design) managed by owner/relayers.
contract AuditBadgeRegistry {
    struct Badge {
        uint256 tokenId;
        address recipient;
        string badgeType;
        string caseId;
        string anchorId;
        string metadataUri;
        uint256 issuedAt;
        uint256 mintedAt;
        address submitter;
        bool exists;
    }

    address public owner;
    mapping(address => bool) public isRelayer;
    uint256 public nextTokenId = 1;
    mapping(uint256 => Badge) private badges;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RelayerUpdated(address indexed relayer, bool enabled);
    event BadgeIssued(
        uint256 indexed tokenId,
        address indexed recipient,
        string badgeType,
        string caseId,
        string anchorId,
        string metadataUri,
        uint256 issuedAt,
        uint256 mintedAt,
        address indexed submitter
    );

    error NotOwner();
    error NotAuthorized();
    error ZeroAddress();
    error BadgeNotFound(uint256 tokenId);
    error EmptyValue(string field);

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    modifier onlyWriter() {
        if (!(msg.sender == owner || isRelayer[msg.sender])) {
            revert NotAuthorized();
        }
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert ZeroAddress();
        }
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        if (relayer == address(0)) {
            revert ZeroAddress();
        }
        isRelayer[relayer] = enabled;
        emit RelayerUpdated(relayer, enabled);
    }

    /// @notice Mint a new badge linked to a prior case anchor.
    function issueBadge(
        address recipient,
        string calldata badgeType,
        string calldata caseId,
        string calldata anchorId,
        string calldata metadataUri,
        uint256 issuedAt
    ) external onlyWriter returns (uint256 tokenId) {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        if (bytes(badgeType).length == 0) {
            revert EmptyValue("badgeType");
        }
        if (bytes(caseId).length == 0) {
            revert EmptyValue("caseId");
        }
        if (bytes(anchorId).length == 0) {
            revert EmptyValue("anchorId");
        }
        if (issuedAt == 0) {
            revert EmptyValue("issuedAt");
        }

        tokenId = nextTokenId;
        nextTokenId += 1;
        uint256 mintedAt = block.timestamp;

        badges[tokenId] = Badge({
            tokenId: tokenId,
            recipient: recipient,
            badgeType: badgeType,
            caseId: caseId,
            anchorId: anchorId,
            metadataUri: metadataUri,
            issuedAt: issuedAt,
            mintedAt: mintedAt,
            submitter: msg.sender,
            exists: true
        });

        emit BadgeIssued(
            tokenId,
            recipient,
            badgeType,
            caseId,
            anchorId,
            metadataUri,
            issuedAt,
            mintedAt,
            msg.sender
        );
    }

    function getBadge(uint256 tokenId) external view returns (Badge memory) {
        Badge memory b = badges[tokenId];
        if (!b.exists) {
            revert BadgeNotFound(tokenId);
        }
        return b;
    }
}
