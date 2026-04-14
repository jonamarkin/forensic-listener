package store

import (
	"context"
	"forensic-listener/models"
)

// Store defines the minimum persistence contract used by the application.
type Store interface {
	SaveTransaction(ctx context.Context, tx *models.Transaction) error
	RecentTransactions(ctx context.Context, limit int) ([]*models.Transaction, error)
	TransactionByHash(ctx context.Context, hash string) (*models.Transaction, error)

	UpsertAccount(ctx context.Context, address string, isContract bool) error
	GetAccount(ctx context.Context, address string) (*models.Account, error)

	SaveFlag(ctx context.Context, flag *models.ForensicFlag) error
	RecentFlags(ctx context.Context, limit int) ([]*models.ForensicFlag, error)

	Close()
}
