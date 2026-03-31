package store

type knownEntitySeed struct {
	Address    string
	Name       string
	EntityType string
	RiskLevel  string
	IsHub      bool
	IsContract bool
}

var builtinKnownEntities = []knownEntitySeed{
	{
		Address:    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
		Name:       "Tether USD",
		EntityType: "stablecoin",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		Name:       "USD Coin",
		EntityType: "stablecoin",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
		Name:       "Wrapped Ether",
		EntityType: "token",
		RiskLevel:  "none",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
		Name:       "Dai Stablecoin",
		EntityType: "stablecoin",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
		Name:       "Uniswap V2 Router",
		EntityType: "dex",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0xE592427A0AEce92De3Edee1F18E0157C05861564",
		Name:       "Uniswap V3 Router",
		EntityType: "dex",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
		Name:       "Wrapped Bitcoin",
		EntityType: "wrapped_asset",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
		Name:       "Lido Staked Ether",
		EntityType: "staking",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0x514910771AF9Ca656af840dff83E8264EcF986CA",
		Name:       "Chainlink Token",
		EntityType: "oracle_token",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
	{
		Address:    "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
		Name:       "Maker",
		EntityType: "governance_token",
		RiskLevel:  "low",
		IsHub:      true,
		IsContract: true,
	},
}
