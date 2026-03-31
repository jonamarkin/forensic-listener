package models

import "time"

type InvestigationCaseSummary struct {
	ID            int64     `json:"id"`
	Title         string    `json:"title"`
	Summary       string    `json:"summary"`
	Status        string    `json:"status"`
	Priority      string    `json:"priority"`
	Owner         string    `json:"owner"`
	AddressCount  int64     `json:"address_count"`
	FlagCount     int64     `json:"flag_count"`
	OpenFlagCount int64     `json:"open_flag_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type CaseAddress struct {
	ID         int64     `json:"id"`
	CaseID     int64     `json:"case_id"`
	Address    string    `json:"address"`
	Role       string    `json:"role"`
	Note       string    `json:"note"`
	AddedAt    time.Time `json:"added_at"`
	EntityName string    `json:"entity_name"`
	EntityType string    `json:"entity_type"`
	RiskLevel  string    `json:"risk_level"`
	IsContract bool      `json:"is_contract"`
}

type InvestigationCaseDetail struct {
	InvestigationCaseSummary
	Addresses []*CaseAddress  `json:"addresses"`
	Flags     []*ForensicFlag `json:"flags"`
}

type AlertTriage struct {
	FlagID      int        `json:"flag_id"`
	Status      string     `json:"status"`
	Assignee    string     `json:"assignee"`
	AnalystNote string     `json:"analyst_note"`
	CaseID      *int64     `json:"case_id,omitempty"`
	CaseTitle   string     `json:"case_title,omitempty"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
