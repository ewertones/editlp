package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	dir := flag.String("dir", "static", "static files directory")
	flag.Parse()

	fs := http.FileServer(http.Dir(*dir))
	http.Handle("/", noCache(fs))

	log.Printf("editlp listening on http://localhost%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, nil))
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}
