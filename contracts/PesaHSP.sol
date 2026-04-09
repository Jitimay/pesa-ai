// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PesaHSP
 * @notice Testnet stand-in for the HashKey Settlement Protocol (HSP) token.
 *         Replace this with the official HSP contract address once available.
 *         Includes a public faucet so hackathon judges can mint test tokens.
 */
contract PesaHSP {
    string public constant name     = "HashKey Settlement Protocol";
    string public constant symbol   = "HSP";
    uint8  public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Faucet: 1000 HSP per call, once per address per day
    uint256 public constant FAUCET_AMOUNT   = 1_000 * 1e18;
    uint256 public constant FAUCET_COOLDOWN = 1 days;
    mapping(address => uint256) public lastFaucet;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ── ERC-20 core ──────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "HSP: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    // ── Faucet ───────────────────────────────────────────────────────────────

    function faucet() external {
        require(
            block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN,
            "HSP: faucet cooldown active"
        );
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "HSP: transfer to zero address");
        require(balanceOf[from] >= amount, "HSP: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }
}
