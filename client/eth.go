package client

import (
	"context"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Client wraps the go-ethereum WebSocket client used by ingestion.
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

// SubscribePendingTransactions streams full pending transactions over WebSocket.
func (c *Client) SubscribePendingTransactions(ctx context.Context) (<-chan *types.Transaction, error) {
	pendingCh := make(chan *types.Transaction, 256)

	sub, err := c.ec.Client().EthSubscribe(ctx, pendingCh, "newPendingTransactions", true)
	if err != nil {
		return nil, fmt.Errorf("subscribing to pending transactions: %w", err)
	}

	txCh := make(chan *types.Transaction, 256)

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
