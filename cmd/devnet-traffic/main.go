// Command devnet-traffic drives a local geth --dev chain with realistic activity so
// every Forensic Listener feature has something to show:
//
//   - ETH and ERC-20 transfers between wallets (a few popular receivers)
//   - contract calls (vault deposits and withdrawals, registry updates)
//   - three-hop ETH and token loops (circular_flow flags, Neo4j)
//   - redeployed Sweeper clones and a modified variant (similar_bytecode, pgvector)
//   - fee-bumped replacements of pending transactions (replaced status)
//
// Run from the repository root while the dev chain is up:
//
//	go run ./cmd/devnet-traffic
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"math/big"
	"math/rand/v2"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
)

var (
	gwei  = big.NewInt(1_000_000_000)
	ether = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)
)

type artifact struct {
	ABI      json.RawMessage `json:"abi"`
	Bytecode string          `json:"bytecode"`
}

type contract struct {
	name    string
	address common.Address
	abi     abi.ABI
}

type wallet struct {
	key     *ecdsa.PrivateKey
	address common.Address
	nonce   uint64
}

type simulator struct {
	ctx       context.Context
	eth       *ethclient.Client
	rpc       *rpc.Client
	chainID   *big.Int
	dev       common.Address
	rng       *rand.Rand
	artifacts map[string]artifact

	deployer *wallet
	wallets  []*wallet

	token, vault, registry *contract
	sweepers               []*contract
}

func main() {
	rpcURL := flag.String("rpc", "http://localhost:8545", "dev chain JSON-RPC URL")
	artifactsPath := flag.String("artifacts", "devnet/contracts/artifacts.json", "compiled contract artifacts")
	walletCount := flag.Int("wallets", 24, "number of simulated wallets")
	interval := flag.Duration("interval", 1500*time.Millisecond, "pause between actions")
	apiURL := flag.String("api", "http://localhost:8080", "Forensic Listener API, used by -label-sweeper")
	labelSweeper := flag.Bool("label-sweeper", false, "label the original Sweeper as a high-risk scam through the API")
	seed := flag.Uint64("seed", 7, "seed for wallets and choices; the same seed gives the same wallet addresses")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	sim, err := newSimulator(ctx, *rpcURL, *artifactsPath, *walletCount, *seed)
	if err != nil {
		log.Fatal(err)
	}
	if err := sim.setup(); err != nil {
		log.Fatalf("setup: %v", err)
	}
	sim.printDirectory()

	if *labelSweeper {
		if err := labelContract(*apiURL, sim.sweepers[0].address, "Sweeper drainer (original)"); err != nil {
			log.Printf("labelling sweeper through the API failed: %v", err)
		} else {
			log.Printf("labelled %s as a high-risk scam", sim.sweepers[0].address.Hex())
		}
	}

	sim.run(*interval)
}

func newSimulator(ctx context.Context, rpcURL, artifactsPath string, walletCount int, seed uint64) (*simulator, error) {
	raw, err := os.ReadFile(artifactsPath)
	if err != nil {
		return nil, fmt.Errorf("reading artifacts (run from the repository root): %w", err)
	}
	var artifacts map[string]artifact
	if err := json.Unmarshal(raw, &artifacts); err != nil {
		return nil, fmt.Errorf("decoding artifacts: %w", err)
	}

	rpcClient, err := rpc.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("connecting to %s: %w", rpcURL, err)
	}
	eth := ethclient.NewClient(rpcClient)

	chainID, err := eth.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading chain id (is the dev chain running?): %w", err)
	}
	if chainID.Cmp(big.NewInt(1)) == 0 {
		return nil, errors.New("refusing to run against Ethereum mainnet (chain id 1)")
	}

	var accounts []common.Address
	if err := rpcClient.CallContext(ctx, &accounts, "eth_accounts"); err != nil || len(accounts) == 0 {
		return nil, fmt.Errorf("the node has no unlocked developer account; start geth with --dev: %v", err)
	}

	sim := &simulator{
		ctx: ctx, eth: eth, rpc: rpcClient, chainID: chainID, dev: accounts[0],
		rng: rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15)), artifacts: artifacts,
	}

	for i := 0; i <= walletCount; i++ {
		var buf [16]byte
		binary.BigEndian.PutUint64(buf[:8], seed)
		binary.BigEndian.PutUint64(buf[8:], uint64(i))
		key, err := crypto.ToECDSA(crypto.Keccak256(buf[:]))
		if err != nil {
			return nil, err
		}
		w := &wallet{key: key, address: crypto.PubkeyToAddress(key.PublicKey)}
		if i == 0 {
			sim.deployer = w
		} else {
			sim.wallets = append(sim.wallets, w)
		}
	}
	return sim, nil
}

func (s *simulator) all() []*wallet {
	return append([]*wallet{s.deployer}, s.wallets...)
}

// setup funds the wallets, deploys the contracts and hands out tokens.
func (s *simulator) setup() error {
	log.Printf("chain id %s, developer account %s", s.chainID, s.dev.Hex())

	var funding []common.Hash
	for _, w := range s.all() {
		balance, err := s.eth.BalanceAt(s.ctx, w.address, nil)
		if err != nil {
			return err
		}
		if balance.Cmp(new(big.Int).Mul(big.NewInt(20), ether)) >= 0 {
			continue
		}
		hash, err := s.fundFromDev(w.address, new(big.Int).Mul(big.NewInt(200), ether))
		if err != nil {
			return fmt.Errorf("funding %s: %w", w.address.Hex(), err)
		}
		funding = append(funding, hash)
	}
	for _, hash := range funding {
		if _, err := s.waitMined(hash); err != nil {
			return err
		}
	}
	for _, w := range s.all() {
		nonce, err := s.eth.PendingNonceAt(s.ctx, w.address)
		if err != nil {
			return err
		}
		w.nonce = nonce
	}
	log.Printf("funded %d wallets", len(funding))

	supply := new(big.Int).Mul(big.NewInt(1_000_000_000), ether)
	var err error
	if s.token, err = s.deploy(s.deployer, "SimpleToken", "Demo Dollar", "DUSD", supply); err != nil {
		return err
	}
	if s.vault, err = s.deploy(s.deployer, "Vault"); err != nil {
		return err
	}
	if s.registry, err = s.deploy(s.deployer, "NameRegistry"); err != nil {
		return err
	}
	collector := s.wallets[len(s.wallets)-1].address
	sweeper, err := s.deploy(s.deployer, "Sweeper", collector)
	if err != nil {
		return err
	}
	s.sweepers = append(s.sweepers, sweeper)

	var transfers []common.Hash
	allocation := new(big.Int).Mul(big.NewInt(1_000_000), ether)
	for _, w := range s.wallets {
		hash, err := s.call(s.deployer, s.token, nil, "transfer", w.address, allocation)
		if err != nil {
			return fmt.Errorf("allocating tokens: %w", err)
		}
		transfers = append(transfers, hash)
	}
	for _, hash := range transfers {
		if _, err := s.waitMined(hash); err != nil {
			return err
		}
	}
	log.Printf("allocated DUSD to %d wallets", len(s.wallets))
	return nil
}

func (s *simulator) printDirectory() {
	fmt.Println()
	fmt.Println("Demo directory (paste these into the Forensic Listener search box)")
	fmt.Println("  Deployer            ", s.deployer.address.Hex())
	fmt.Println("  DUSD token          ", s.token.address.Hex())
	fmt.Println("  Vault               ", s.vault.address.Hex())
	fmt.Println("  NameRegistry        ", s.registry.address.Hex())
	fmt.Println("  Sweeper (original)  ", s.sweepers[0].address.Hex(), " <- label this as high-risk scam to see clone detection")
	fmt.Println("  Sweeper collector   ", s.wallets[len(s.wallets)-1].address.Hex())
	fmt.Println()
}

func (s *simulator) run(interval time.Duration) {
	log.Printf("generating traffic every %s (Ctrl+C to stop)", interval)
	for i := 1; s.ctx.Err() == nil; i++ {
		var err error
		switch {
		case i%23 == 0:
			err = s.ethLoop()
		case i%31 == 0:
			err = s.tokenLoop()
		case i%150 == 0:
			err = s.deploySweeper("Sweeper")
		case i%400 == 0:
			err = s.deploySweeper("SweeperV2")
		case i%13 == 0:
			err = s.replacePending()
		case i%100 == 0:
			err = s.topUp()
		default:
			err = s.randomAction()
		}
		if err != nil && s.ctx.Err() == nil {
			log.Printf("action failed: %v", err)
			s.resyncNonces()
		}

		select {
		case <-s.ctx.Done():
		case <-time.After(interval):
		}
	}
}

func (s *simulator) randomAction() error {
	from := s.pickSender()
	switch roll := s.rng.IntN(100); {
	case roll < 40:
		to := s.pickReceiver(from)
		value := s.randomEth(0.01, 2)
		_, err := s.send(from, &to.address, value, nil, 21_000, 1)
		if err == nil {
			log.Printf("ETH   %s -> %s  %s ETH", short(from.address), short(to.address), ethString(value))
		}
		return err
	case roll < 70:
		to := s.pickReceiver(from)
		amount := new(big.Int).Mul(big.NewInt(int64(s.rng.IntN(5000)+1)), ether)
		_, err := s.call(from, s.token, nil, "transfer", to.address, amount)
		if err == nil {
			log.Printf("DUSD  %s -> %s  %s", short(from.address), short(to.address), new(big.Int).Div(amount, ether))
		}
		return err
	case roll < 80:
		if s.rng.IntN(2) == 0 {
			_, err := s.call(from, s.vault, s.randomEth(0.05, 1), "deposit")
			if err == nil {
				log.Printf("CALL  %s vault.deposit", short(from.address))
			}
			return err
		}
		return nil
	case roll < 90:
		label := fmt.Sprintf("name-%d", s.rng.IntN(500))
		_, err := s.call(from, s.registry, nil, "register", label, "ipfs://demo/"+label)
		if err != nil && strings.Contains(err.Error(), "taken") {
			return nil
		}
		if err == nil {
			log.Printf("CALL  %s registry.register(%s)", short(from.address), label)
		}
		return err
	default:
		target := s.sweepers[s.rng.IntN(len(s.sweepers))]
		value := s.randomEth(0.1, 1.5)
		_, err := s.send(from, &target.address, value, nil, 80_000, 1)
		if err == nil {
			log.Printf("SCAM  victim %s sends %s ETH to sweeper %s", short(from.address), ethString(value), short(target.address))
		}
		return err
	}
}

// ethLoop moves ETH around three wallets in order, waiting for each leg to be mined.
func (s *simulator) ethLoop() error {
	a, b, c := s.threeWallets()
	value := s.randomEth(1, 4)
	path := []*wallet{a, b, c, a}
	for i := 0; i < 3; i++ {
		leg := new(big.Int).Div(new(big.Int).Mul(value, big.NewInt(int64(100-3*i))), big.NewInt(100))
		hash, err := s.send(path[i], &path[i+1].address, leg, nil, 21_000, 1)
		if err != nil {
			return err
		}
		if _, err := s.waitMined(hash); err != nil {
			return err
		}
	}
	log.Printf("LOOP  ETH  %s -> %s -> %s -> %s", short(a.address), short(b.address), short(c.address), short(a.address))
	return nil
}

func (s *simulator) tokenLoop() error {
	a, b, c := s.threeWallets()
	amount := new(big.Int).Mul(big.NewInt(int64(s.rng.IntN(20_000)+5_000)), ether)
	path := []*wallet{a, b, c, a}
	for i := 0; i < 3; i++ {
		hash, err := s.call(path[i], s.token, nil, "transfer", path[i+1].address, amount)
		if err != nil {
			return err
		}
		if _, err := s.waitMined(hash); err != nil {
			return err
		}
	}
	log.Printf("LOOP  DUSD %s -> %s -> %s -> %s", short(a.address), short(b.address), short(c.address), short(a.address))
	return nil
}

func (s *simulator) deploySweeper(name string) error {
	deployer := s.wallets[s.rng.IntN(len(s.wallets)-1)]
	collector := s.wallets[s.rng.IntN(len(s.wallets))].address
	c, err := s.deploy(deployer, name, collector)
	if err != nil {
		return err
	}
	s.sweepers = append(s.sweepers, c)
	kind := "clone of the original"
	if name == "SweeperV2" {
		kind = "modified variant"
	}
	log.Printf("DEPLOY %s %s (%s) by %s", name, c.address.Hex(), kind, short(deployer.address))
	return nil
}

// replacePending sends a low-fee transfer and immediately replaces it with a
// higher-fee transaction using the same nonce, as wallets do for "speed up".
func (s *simulator) replacePending() error {
	from := s.pickSender()
	to := s.pickReceiver(from)
	nonce := from.nonce

	value := s.randomEth(0.1, 1)
	first, err := s.send(from, &to.address, value, nil, 21_000, 1)
	if err != nil {
		return err
	}
	from.nonce = nonce
	second, err := s.send(from, &to.address, value, nil, 21_000, 4)
	if err != nil {
		from.nonce = nonce + 1
		return nil // the first one was mined before it could be replaced
	}
	log.Printf("REPLACE %s nonce %d: %s replaced by %s", short(from.address), nonce, short(first), short(second))
	return nil
}

func (s *simulator) topUp() error {
	for _, w := range s.all() {
		balance, err := s.eth.BalanceAt(s.ctx, w.address, nil)
		if err != nil {
			return err
		}
		if balance.Cmp(new(big.Int).Mul(big.NewInt(20), ether)) < 0 {
			if _, err := s.fundFromDev(w.address, new(big.Int).Mul(big.NewInt(200), ether)); err != nil {
				return err
			}
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Transaction plumbing
// ---------------------------------------------------------------------------

func (s *simulator) fundFromDev(to common.Address, value *big.Int) (common.Hash, error) {
	var hash common.Hash
	err := s.rpc.CallContext(s.ctx, &hash, "eth_sendTransaction", map[string]any{
		"from":  s.dev,
		"to":    to,
		"value": hexutil.EncodeBig(value),
	})
	return hash, err
}

func (s *simulator) send(from *wallet, to *common.Address, value *big.Int, data []byte, gas uint64, tipGwei int64) (common.Hash, error) {
	if value == nil {
		value = new(big.Int)
	}
	if gas == 0 {
		estimate, err := s.eth.EstimateGas(s.ctx, ethereum.CallMsg{From: from.address, To: to, Value: value, Data: data})
		if err != nil {
			return common.Hash{}, fmt.Errorf("estimating gas: %w", err)
		}
		gas = estimate * 13 / 10
	}

	head, err := s.eth.HeaderByNumber(s.ctx, nil)
	if err != nil {
		return common.Hash{}, err
	}
	baseFee := new(big.Int).Set(gwei)
	if head.BaseFee != nil && head.BaseFee.Cmp(baseFee) > 0 {
		baseFee = head.BaseFee
	}
	tip := new(big.Int).Mul(big.NewInt(tipGwei), gwei)
	feeCap := new(big.Int).Add(new(big.Int).Mul(baseFee, big.NewInt(2)), tip)

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID: s.chainID, Nonce: from.nonce, GasTipCap: tip, GasFeeCap: feeCap,
		Gas: gas, To: to, Value: value, Data: data,
	})
	signed, err := types.SignTx(tx, types.LatestSignerForChainID(s.chainID), from.key)
	if err != nil {
		return common.Hash{}, err
	}
	if err := s.eth.SendTransaction(s.ctx, signed); err != nil {
		return common.Hash{}, err
	}
	from.nonce++
	return signed.Hash(), nil
}

func (s *simulator) deploy(from *wallet, name string, args ...any) (*contract, error) {
	art, ok := s.artifacts[name]
	if !ok {
		return nil, fmt.Errorf("no artifact for %s", name)
	}
	parsed, err := abi.JSON(bytes.NewReader(art.ABI))
	if err != nil {
		return nil, err
	}
	input, err := parsed.Pack("", args...)
	if err != nil {
		return nil, fmt.Errorf("packing %s constructor: %w", name, err)
	}
	data := append(common.FromHex(art.Bytecode), input...)

	hash, err := s.send(from, nil, nil, data, 0, 1)
	if err != nil {
		return nil, fmt.Errorf("deploying %s: %w", name, err)
	}
	receipt, err := s.waitMined(hash)
	if err != nil {
		return nil, err
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return nil, fmt.Errorf("deploying %s reverted", name)
	}
	return &contract{name: name, address: receipt.ContractAddress, abi: parsed}, nil
}

func (s *simulator) call(from *wallet, c *contract, value *big.Int, method string, args ...any) (common.Hash, error) {
	data, err := c.abi.Pack(method, args...)
	if err != nil {
		return common.Hash{}, fmt.Errorf("packing %s.%s: %w", c.name, method, err)
	}
	return s.send(from, &c.address, value, data, 0, 1)
}

func (s *simulator) waitMined(hash common.Hash) (*types.Receipt, error) {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		receipt, err := s.eth.TransactionReceipt(s.ctx, hash)
		if err == nil {
			return receipt, nil
		}
		if !errors.Is(err, ethereum.NotFound) {
			return nil, err
		}
		select {
		case <-s.ctx.Done():
			return nil, s.ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
	return nil, fmt.Errorf("transaction %s not mined within 60 s", hash.Hex())
}

func (s *simulator) resyncNonces() {
	for _, w := range s.all() {
		if nonce, err := s.eth.PendingNonceAt(s.ctx, w.address); err == nil {
			w.nonce = nonce
		}
	}
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

func (s *simulator) pickSender() *wallet {
	return s.wallets[s.rng.IntN(len(s.wallets)-1)]
}

// pickReceiver favours low-index wallets so a few addresses become busy hubs.
func (s *simulator) pickReceiver(exclude *wallet) *wallet {
	for {
		index := int(float64(len(s.wallets)-1) * s.rng.Float64() * s.rng.Float64())
		if w := s.wallets[index]; w != exclude {
			return w
		}
	}
}

func (s *simulator) threeWallets() (*wallet, *wallet, *wallet) {
	perm := s.rng.Perm(len(s.wallets) - 1)
	return s.wallets[perm[0]], s.wallets[perm[1]], s.wallets[perm[2]]
}

func (s *simulator) randomEth(min, max float64) *big.Int {
	milli := int64((min + s.rng.Float64()*(max-min)) * 1000)
	return new(big.Int).Mul(big.NewInt(milli), big.NewInt(1_000_000_000_000_000))
}

func labelContract(apiURL string, address common.Address, name string) error {
	body, _ := json.Marshal(map[string]string{"name": name, "entity_type": "scam", "risk_level": "high"})
	resp, err := http.Post(strings.TrimRight(apiURL, "/")+"/entities/"+address.Hex(), "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned %s", resp.Status)
	}
	return nil
}

func short(value fmt.Stringer) string {
	text := value.String()
	if len(text) < 12 {
		return text
	}
	return text[:6] + "…" + text[len(text)-4:]
}

func ethString(wei *big.Int) string {
	f, _ := new(big.Float).Quo(new(big.Float).SetInt(wei), new(big.Float).SetInt(ether)).Float64()
	return fmt.Sprintf("%.3f", f)
}
