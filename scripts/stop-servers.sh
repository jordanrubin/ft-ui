#!/bin/bash
# stop runeforge canvas servers

echo "stopping servers..."
pkill -f "runeforge-api" 2>/dev/null && echo "API stopped" || echo "API not running"
pkill -f "vite" 2>/dev/null && echo "React stopped" || echo "React not running"
