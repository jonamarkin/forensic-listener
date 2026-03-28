package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Config struct {
	AuthToken          string
	AllowedOrigin      string
	RateLimitPerMinute int
	StreamInterval     time.Duration
}

type rateLimiter struct {
	limit   int
	mu      sync.Mutex
	clients map[string]*clientWindow
}

type clientWindow struct {
	count   int
	resetAt time.Time
}

func newRateLimiter(limit int) *rateLimiter {
	return &rateLimiter{
		limit:   limit,
		clients: make(map[string]*clientWindow),
	}
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	if rl == nil || rl.limit <= 0 {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		ip := requestIP(r)
		now := time.Now()

		rl.mu.Lock()
		window, ok := rl.clients[ip]
		if !ok || now.After(window.resetAt) {
			window = &clientWindow{resetAt: now.Add(time.Minute)}
			rl.clients[ip] = window
		}
		window.count++
		remaining := rl.limit - window.count
		resetIn := int(time.Until(window.resetAt).Seconds())
		allowed := window.count <= rl.limit
		rl.mu.Unlock()

		w.Header().Set("X-RateLimit-Limit", strconv.Itoa(rl.limit))
		if remaining < 0 {
			remaining = 0
		}
		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		w.Header().Set("X-RateLimit-Reset", strconv.Itoa(resetIn))

		if !allowed {
			w.Header().Set("Retry-After", strconv.Itoa(resetIn))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": "rate limit exceeded",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func authMiddleware(token string) func(http.Handler) http.Handler {
	if token == "" {
		return func(next http.Handler) http.Handler { return next }
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isPublicPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			if supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "); supplied == token {
				next.ServeHTTP(w, r)
				return
			}
			if r.Header.Get("X-API-Token") == token {
				next.ServeHTTP(w, r)
				return
			}
			if r.URL.Path == "/stream/events" && r.URL.Query().Get("access_token") == token {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("WWW-Authenticate", `Bearer realm="forensic-listener"`)
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "missing or invalid API token",
			})
		})
	}
}

func corsMiddleware(allowedOrigin string) func(http.Handler) http.Handler {
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Token, Last-Event-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func requestIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func isPublicPath(path string) bool {
	switch path {
	case "/", "/health", "/favicon.ico":
		return true
	default:
		return false
	}
}
