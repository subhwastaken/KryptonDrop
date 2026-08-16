// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ComputeClaimNFT
 * @notice Minimal self-contained ERC-721 representing KryptonDrop compute voucher claims.
 *         Deployed on Monad Testnet (Chain ID 10143).
 *
 * Features:
 *   - Minter-controlled: only the deployer key (backend) can mint and transfer freely
 *   - Standard ERC-721 + ERC-721Metadata interfaces
 *   - tokenURI stored on-chain per token (set at mint time)
 *   - Auto-incrementing token IDs starting at 1
 */
contract ComputeClaimNFT {
    // ── ERC-721 Metadata ─────────────────────────────────────────────────────
    string public name     = "KryptonDrop Compute Claim";
    string public symbol   = "CLAIM";

    // ── Access control ───────────────────────────────────────────────────────
    address public minter;

    // ── Token state ──────────────────────────────────────────────────────────
    uint256 private _nextTokenId = 1;

    mapping(uint256 => address)                        private _owners;
    mapping(address => uint256)                        private _balances;
    mapping(uint256 => address)                        private _tokenApprovals;
    mapping(address => mapping(address => bool))       private _operatorApprovals;
    mapping(uint256 => string)                         private _tokenURIs;

    // ── Events ───────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor() {
        minter = msg.sender;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "ComputeClaimNFT: caller is not minter");
        _;
    }

    // ── ERC-165 ──────────────────────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f || // ERC721Metadata
            interfaceId == 0x01ffc9a7;   // ERC165
    }

    // ── ERC-721 view functions ───────────────────────────────────────────────
    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "ERC721: zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: token does not exist");
        return owner;
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_owners[tokenId] != address(0), "ERC721: token does not exist");
        return _tokenURIs[tokenId];
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "ERC721: token does not exist");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    // ── ERC-721 write functions ──────────────────────────────────────────────
    function approve(address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(to != owner, "ERC721: approval to current owner");
        require(
            msg.sender == owner || _operatorApprovals[owner][msg.sender],
            "ERC721: not authorized to approve"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(operator != msg.sender, "ERC721: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(from == owner, "ERC721: transfer from incorrect owner");
        require(to != address(0), "ERC721: transfer to the zero address");
        require(
            msg.sender == owner   ||
            msg.sender == minter  || // backend minter key can always transfer
            _tokenApprovals[tokenId] == msg.sender ||
            _operatorApprovals[owner][msg.sender],
            "ERC721: not authorized to transfer"
        );
        delete _tokenApprovals[tokenId];
        unchecked { _balances[from]--; _balances[to]++; }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    // ── Minter-only functions ────────────────────────────────────────────────

    /**
     * @notice Mint a new Compute Claim NFT to `to` with metadata at `uri`.
     * @return tokenId The newly minted token ID.
     */
    function mint(address to, string calldata uri) external onlyMinter returns (uint256 tokenId) {
        require(to != address(0), "ERC721: mint to the zero address");
        tokenId = _nextTokenId++;
        _owners[tokenId]    = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
        emit Transfer(address(0), to, tokenId);
    }

    /**
     * @notice Returns the next token ID that will be minted (useful for off-chain indexing).
     */
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }
}
