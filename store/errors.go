package store

import "fmt"

// NotFoundError is returned when a requested record does not exist.
type NotFoundError struct {
	Resource string
	ID       string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("%s not found: %s", e.Resource, e.ID)
}

// ConflictError is returned on duplicate inserts that should not be retried.
type ConflictError struct {
	Resource string
	ID       string
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("%s already exists: %s", e.Resource, e.ID)
}
