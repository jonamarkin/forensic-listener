package client

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
)

// Client wraps the go-ethereum WebSocket client used by ingestion and the API.
type Client struct {
	ec *ethclient.Client
}

func New(ctx context.Context, url string) (*Client, error) {
	ec, err := ethclient.DialContext(ctx, url)
	if err != nil {
		if strings.Contains(err.Error(), "websocket: bad handshake") {
			return nil, fmt.Errorf(
				"dialling node at %s: endpoint did not accept a WebSocket upgrade; subscriptions require a WebSocket RPC endpoint such as ws://localhost:8546: %w",
				url, err,
			)
		}
		return nil, fmt.Errorf("dialling node at %s: %w", url, err)
	}
	return &Client{ec: ec}, nil
}

func (c *Client) Close() {
	c.ec.Close()
}

// CodeAt fetches the latest deployed bytecode for an address.
func (c *Client) CodeAt(ctx context.Context, address string) ([]byte, error) {
	if !common.IsHexAddress(address) {
		return nil, fmt.Errorf("invalid hex address: %s", address)
	}
	code, err := c.ec.CodeAt(ctx, common.HexToAddress(address), nil)
	if err != nil {
		return nil, fmt.Errorf("loading code at %s: %w", address, err)
	}
	return code, nil
}

// BalanceAt returns the latest balance of an address in wei.
func (c *Client) BalanceAt(ctx context.Context, address string) (*big.Int, error) {
	if !common.IsHexAddress(address) {
		return nil, fmt.Errorf("invalid hex address: %s", address)
	}
	return c.ec.BalanceAt(ctx, common.HexToAddress(address), nil)
}

// BlockNumber returns the node's latest block number.
func (c *Client) BlockNumber(ctx context.Context) (uint64, error) {
	return c.ec.BlockNumber(ctx)
}

func (c *Client) BlockByHash(ctx context.Context, hash common.Hash) (*types.Block, error) {
	return c.ec.BlockByHash(ctx, hash)
}

func (c *Client) BlockByNumber(ctx context.Context, number uint64) (*types.Block, error) {
	return c.ec.BlockByNumber(ctx, new(big.Int).SetUint64(number))
}

// BlockReceipts fetches every receipt in a block with a single eth_getBlockReceipts call.
func (c *Client) BlockReceipts(ctx context.Context, hash common.Hash) ([]*types.Receipt, error) {
	return c.ec.BlockReceipts(ctx, rpc.BlockNumberOrHashWithHash(hash, false))
}

// StreamPendingTransactions delivers full pending transactions and transparently
// re-subscribes (with backoff) if the node connection drops. The channel closes
// only when ctx is cancelled.
func (c *Client) StreamPendingTransactions(ctx context.Context, onState func(connected bool)) <-chan *types.Transaction {
	return stream(ctx, "pending-transactions", func(ctx context.Context, ch chan *types.Transaction) (ethereum.Subscription, error) {
		return c.ec.Client().EthSubscribe(ctx, ch, "newPendingTransactions", true)
	}, onState)
}

// StreamNewHeads delivers new block headers, re-subscribing on failure.
func (c *Client) StreamNewHeads(ctx context.Context, onState func(connected bool)) <-chan *types.Header {
	return stream(ctx, "new-heads", func(ctx context.Context, ch chan *types.Header) (ethereum.Subscription, error) {
		return c.ec.SubscribeNewHead(ctx, ch)
	}, onState)
}

func stream[T any](
	ctx context.Context,
	name string,
	subscribe func(context.Context, chan T) (ethereum.Subscription, error),
	onState func(bool),
) <-chan T {
	out := make(chan T, 256)
	if onState == nil {
		onState = func(bool) {}
	}

	go func() {
		defer close(out)
		const maxBackoff = 30 * time.Second
		backoff := time.Second

		for ctx.Err() == nil {
			in := make(chan T, 256)
			sub, err := subscribe(ctx, in)
			if err != nil {
				onState(false)
				log.Printf("[node] %s subscription failed: %v (retrying in %s)", name, err, backoff)
				if !sleep(ctx, backoff) {
					return
				}
				backoff = min(backoff*2, maxBackoff)
				continue
			}

			onState(true)
			backoff = time.Second
			log.Printf("[node] %s subscription active", name)

			dropped := pump(ctx, sub, in, out)
			sub.Unsubscribe()
			onState(false)
			if !dropped {
				return
			}
			log.Printf("[node] %s subscription dropped; re-subscribing", name)
			if !sleep(ctx, backoff) {
				return
			}
		}
	}()

	return out
}

// pump forwards items until the subscription errors (returns true) or ctx ends (false).
func pump[T any](ctx context.Context, sub ethereum.Subscription, in <-chan T, out chan<- T) bool {
	for {
		select {
		case <-ctx.Done():
			return false
		case err := <-sub.Err():
			if err != nil {
				log.Printf("[node] subscription error: %v", err)
			}
			return true
		case item := <-in:
			select {
			case out <- item:
			case <-ctx.Done():
				return false
			}
		}
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
