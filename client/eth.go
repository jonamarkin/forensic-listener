package client

import (
	"context"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Client wraps the go-ethereum WebSocket client.
// WebSocket is required (not HTTP) because we need a persistent
// connection to receive pushed transaction events from Geth.
type Client struct {
	ec *ethclient.Client
}

func New(ctx context.Context, url string) (*Client, error) {
	ec, err := ethclient.DialContext(ctx, url)
	if err != nil {
		if strings.Contains(err.Error(), "websocket: bad handshake") {
			return nil, fmt.Errorf(
				"dialling geth at %s: endpoint did not accept a WebSocket upgrade; pending-transaction subscriptions require a WebSocket RPC endpoint such as ws://localhost:8546 or a node started with WebSocket enabled: %w",
				url, err,
			)
		}
		return nil, fmt.Errorf("dialling geth at %s: %w", url, err)
	}
	return &Client{ec: ec}, nil
}

func (c *Client) Close() {
	c.ec.Close()
}

// CodeAt fetches the latest deployed bytecode for an address.
// Externally owned accounts return an empty slice.
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

// SubscribePendingTransactions opens a WebSocket subscription for
// pending transactions and returns a channel of full transaction objects.
// The caller owns the channel and should drain it until it is closed.
func (c *Client) SubscribePendingTransactions(ctx context.Context) (<-chan *types.Transaction, error) {
	pendingCh := make(chan *types.Transaction, 256)

	// ethclient exposes the underlying RPC client, and Geth accepts a boolean
	// flag here to stream full transactions instead of only hashes.
	sub, err := c.ec.Client().EthSubscribe(ctx, pendingCh, "newPendingTransactions", true)
	if err != nil {
		return nil, fmt.Errorf("subscribing to pending transactions: %w", err)
	}

	txCh := make(chan *types.Transaction, 256)

	// Relay transactions onto our returned channel so we can close it
	// cleanly when the context is cancelled or the subscription ends.
	go func() {
		defer close(txCh)
		defer sub.Unsubscribe()

		for {
			select {
			case <-ctx.Done():
				return
			case <-sub.Err():
				return
			case tx, ok := <-pendingCh:
				if !ok {
					return
				}
				select {
				case txCh <- tx:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return txCh, nil
}
