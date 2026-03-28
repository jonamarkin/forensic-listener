package store

import (
	"strings"

	"github.com/ethereum/go-ethereum/common"
)

// NormalizeAddress trims input and returns the canonical Ethereum checksum
// form when the value is a valid hex address. Non-address strings are
// returned trimmed so callers can safely use this on user input.
func NormalizeAddress(address string) string {
	cleaned := strings.TrimSpace(address)
	if cleaned == "" {
		return ""
	}
	if common.IsHexAddress(cleaned) {
		return common.HexToAddress(cleaned).Hex()
	}
	return cleaned
}
