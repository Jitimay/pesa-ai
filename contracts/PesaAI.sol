// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title PesaAI
 * @notice AI-powered SMS payment logger on HashKey Chain.
 *         Supports both native HSK and HSP (HashKey Settlement Protocol) ERC-20 token.
 *         PayFi track: HSP token is the primary settlement currency.
 */
contract PesaAI {
    // ── Types ────────────────────────────────────────────────────────────────

    enum PaymentToken { HSK, HSP }

    struct PaymentRecord {
        address      sender;
        address      recipient;
        uint256      amount;       // token amount (wei for HSK, token units for HSP)
        string       currency;     // "HSK" | "HSP" | "USD" | "FBU" | "EUR"
        string       smsIntent;    // original SMS text
        string       parsedBy;     // AI model tag
        uint256      timestamp;
        uint256      txId;
        PaymentToken token;        // which token was used
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    mapping(uint256 => PaymentRecord)    public payments;
    mapping(address => uint256[])        public userPayments;
    mapping(string => address)           public aliases; // name -> wallet

    uint256 public txCounter;
    uint256 public totalVolumeHSK;   // total native HSK settled (wei)
    uint256 public totalVolumeHSP;   // total HSP token settled (token units)
    address public owner;
    address public hspToken;         // HSP ERC-20 contract address

    // ── Events ───────────────────────────────────────────────────────────────

    event AliasRegistered(string indexed name, address indexed wallet);
    event PaymentLogged(
        uint256 indexed txId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string  currency,
        string  smsIntent,
        uint256 timestamp,
        uint8   token          // 0 = HSK, 1 = HSP
    );

    event HspTokenUpdated(address indexed oldToken, address indexed newToken);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _hspToken) {
        owner    = msg.sender;
        hspToken = _hspToken;
    }

    // ── Owner admin ──────────────────────────────────────────────────────────

    /// @notice Update HSP token address (e.g. when official HSP is deployed)
    function setHspToken(address _hspToken) external onlyOwner {
        emit HspTokenUpdated(hspToken, _hspToken);
        hspToken = _hspToken;
    }

    // ── Alias Registry ───────────────────────────────────────────────────────

    /**
     * @notice Register a human-readable name for a wallet.
     *         In a production app, this might involve ZKID or phone verification.
     */
    function registerAlias(string calldata name, address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid address");
        aliases[name] = wallet;
        emit AliasRegistered(name, wallet);
    }

    function resolveAlias(string calldata name) external view returns (address) {
        return aliases[name];
    }

    // ── Payment: native HSK ──────────────────────────────────────────────────

    function logPaymentHSK(
        address recipient,
        uint256 amount,
        string calldata currency,
        string calldata smsIntent
    ) external payable {
        require(msg.value > 0,  "Value must be > 0");
        require(recipient != address(0), "Invalid recipient");

        _recordPayment(recipient, amount, currency, smsIntent, PaymentToken.HSK);
        totalVolumeHSK += msg.value;

        // Forward HSK to recipient
        (bool sent, ) = payable(recipient).call{value: msg.value}("");
        require(sent, "HSK transfer failed");
    }

    // ── Payment: HSP token ───────────────────────────────────────────────────

    function logPaymentHSP(
        address recipient,
        uint256 amount,
        string calldata currency,
        string calldata smsIntent
    ) external {
        require(amount > 0,     "Amount must be > 0");
        require(recipient != address(0), "Invalid recipient");
        require(hspToken != address(0),  "HSP token not configured");

        // Pull HSP from sender → recipient directly
        bool ok = IERC20(hspToken).transferFrom(msg.sender, recipient, amount);
        require(ok, "HSP transfer failed");

        _recordPayment(recipient, amount, currency, smsIntent, PaymentToken.HSP);
        totalVolumeHSP += amount;
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function getPayment(uint256 txId) external view returns (PaymentRecord memory) {
        require(txId > 0 && txId <= txCounter, "Invalid txId");
        return payments[txId];
    }

    function getUserPayments(address user) external view returns (uint256[] memory) {
        return userPayments[user];
    }

    function getUserPaymentRecords(address user)
        external
        view
        returns (PaymentRecord[] memory)
    {
        uint256[] memory ids = userPayments[user];
        PaymentRecord[] memory records = new PaymentRecord[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            records[i] = payments[ids[i]];
        }
        return records;
    }

    function getRecentPayments(uint256 count) external view returns (PaymentRecord[] memory) {
        if (count > 20) count = 20;
        uint256 available   = txCounter;
        uint256 resultSize  = count > available ? available : count;
        PaymentRecord[] memory recent = new PaymentRecord[](resultSize);
        for (uint256 i = 0; i < resultSize; i++) {
            recent[i] = payments[txCounter - i];
        }
        return recent;
    }

    function getStats()
        external
        view
        returns (
            uint256 totalTx,
            uint256 contractBalanceHSK,
            uint256 _totalVolumeHSK,
            uint256 _totalVolumeHSP
        )
    {
        return (txCounter, address(this).balance, totalVolumeHSK, totalVolumeHSP);
    }

    // ── Owner withdraw ───────────────────────────────────────────────────────

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No HSK funds");
        (bool sent, ) = payable(owner).call{value: balance}("");
        require(sent, "Withdraw failed");
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _recordPayment(
        address recipient,
        uint256 amount,
        string calldata currency,
        string calldata smsIntent,
        PaymentToken token
    ) internal {
        txCounter += 1;
        uint256 txId = txCounter;

        payments[txId] = PaymentRecord({
            sender:    msg.sender,
            recipient: recipient,
            amount:    amount,
            currency:  currency,
            smsIntent: smsIntent,
            parsedBy:  "Pesa AI v2.0",
            timestamp: block.timestamp,
            txId:      txId,
            token:     token
        });

        userPayments[msg.sender].push(txId);

        emit PaymentLogged(
            txId,
            msg.sender,
            recipient,
            amount,
            currency,
            smsIntent,
            block.timestamp,
            uint8(token)
        );
    }

    receive() external payable {}
}
