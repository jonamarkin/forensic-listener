package ingestion

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"

	"forensic-listener/models"
)

// maxBlockBackfill bounds how many missed blocks are fetched after a disconnect.
const maxBlockBackfill = 32

// transferTopic is keccak256("Transfer(address,address,uint256)"), topic 0 of ERC-20 Transfer logs.
var transferTopic = crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)"))

func (e *Engine) runBlocks(ctx context.Context) {
	heads := e.client.StreamNewHeads(ctx, e.status.headsConnected.Store)

	var last uint64
	for head := range heads {
		number := head.Number.Uint64()
		e.status.touchHead(number)

		start := number
		if last != 0 && number > last+1 {
			start = max(last+1, number-maxBlockBackfill+1)
			log.Printf("[blocks] gap detected: backfilling blocks %d-%d", start, number-1)
		}

		for n := start; n <= number && ctx.Err() == nil; n++ {
			var block *types.Block
			var err error
			if n == number {
				block, err = e.client.BlockByHash(ctx, head.Hash())
			} else {
				block, err = e.client.BlockByNumber(ctx, n)
			}
			if err != nil {
				log.Printf("[blocks] fetching block %d: %v", n, err)
				break
			}
			if err := e.ingestBlock(ctx, block); err != nil {
				if ctx.Err() == nil {
					log.Printf("[blocks] ingesting block %d: %v", n, err)
				}
				break
			}
		}
		last = number
	}
}

func (e *Engine) ingestBlock(ctx context.Context, block *types.Block) error {
	mined := &models.MinedBlock{
		Block: models.Block{
			Number:     block.NumberU64(),
			Hash:       block.Hash().Hex(),
			ParentHash: block.ParentHash().Hex(),
			MinedAt:    time.Unix(int64(block.Time()), 0).UTC(),
			TxCount:    len(block.Transactions()),
			GasUsed:    block.GasUsed(),
		},
		Receipts: make(map[string]models.Receipt, len(block.Transactions())),
	}
	if block.BaseFee() != nil {
		fee := block.BaseFee().String()
		mined.Block.BaseFee = &fee
	}

	byHash := make(map[string]*models.Transaction, len(block.Transactions()))
	for _, raw := range block.Transactions() {
		tx, err := toModel(raw, mined.Block.MinedAt)
		if err != nil {
			log.Printf("[blocks] skipping %s in block %d: %v", raw.Hash().Hex(), mined.Block.Number, err)
			continue
		}
		tx.Status = models.TxMined
		mined.Transactions = append(mined.Transactions, tx)
		byHash[tx.Hash] = tx
	}

	receipts, err := e.client.BlockReceipts(ctx, block.Hash())
	if err != nil {
		// The block is still worth recording; receipts-derived data will be missing.
		log.Printf("[blocks] receipts for block %d unavailable: %v", mined.Block.Number, err)
	}
	for _, receipt := range receipts {
		hash := receipt.TxHash.Hex()
		r := models.Receipt{GasUsed: receipt.GasUsed, Status: int(receipt.Status)}
		if receipt.EffectiveGasPrice != nil {
			r.EffectiveGasPrice = receipt.EffectiveGasPrice.String()
		}
		mined.Receipts[hash] = r

		if receipt.ContractAddress != (common.Address{}) {
			if tx, ok := byHash[hash]; ok && tx.To == "" {
				tx.CreatedContract = receipt.ContractAddress.Hex()
			}
		}
		if receipt.Status != types.ReceiptStatusSuccessful {
			continue
		}
		for _, lg := range receipt.Logs {
			if transfer := decodeTransfer(lg, mined.Block); transfer != nil {
				mined.TokenTransfers = append(mined.TokenTransfers, transfer)
			}
		}
	}

	if err := e.pg.SaveBlock(ctx, mined); err != nil {
		return fmt.Errorf("saving block %d: %w", mined.Block.Number, err)
	}
	return nil
}

// decodeTransfer decodes an ERC-20 Transfer log: three topics (signature, from, to)
// and a 32-byte amount. ERC-721 transfers carry a fourth topic and are skipped.
func decodeTransfer(lg *types.Log, block models.Block) *models.TokenTransfer {
	if len(lg.Topics) != 3 || lg.Topics[0] != transferTopic || len(lg.Data) != 32 {
		return nil
	}
	return &models.TokenTransfer{
		TxHash:      lg.TxHash.Hex(),
		LogIndex:    lg.Index,
		BlockNumber: block.Number,
		Token:       lg.Address.Hex(),
		From:        common.BytesToAddress(lg.Topics[1].Bytes()).Hex(),
		To:          common.BytesToAddress(lg.Topics[2].Bytes()).Hex(),
		Amount:      new(big.Int).SetBytes(lg.Data).String(),
		MinedAt:     block.MinedAt,
	}
}
