// Go: alert engine - builds unit alerts and logs them
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

type Req struct {
	ComplaintID string   `json:"complaint_id"`
	Atms        []string `json:"atms"`
	Window      int      `json:"window"`
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			w.Write([]byte(`{"ok":true}`))
			return
		}
		var q Req
		json.NewDecoder(r.Body).Decode(&q)
		id := fmt.Sprintf("AL-%d", time.Now().UnixNano()%1000000)
		msg := fmt.Sprintf("Notify Cyber Cell & beat units near %s within %d min. Request account freeze.", strings.Join(q.Atms, ", "), q.Window)
		f, _ := os.OpenFile("alerts.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		defer f.Close()
		fmt.Fprintf(f, "%s %s %s\n", time.Now().Format(time.RFC3339), id, msg)
		json.NewEncoder(w).Encode(map[string]any{"alert_id": id, "message": msg, "channels": []string{"SMS", "Dashboard", "Wireless"}})
	})
	http.ListenAndServe("127.0.0.1:8002", nil)
}
