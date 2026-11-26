#!/bin/bash
export DISPLAY="${DISPLAY:-:0.0}"
mkdir -p /userdata/saves/ports/4WDSimulator
export LD_LIBRARY_PATH=/userdata/system/4wd-simulator
exec /userdata/system/4wd-simulator/4wd-simulator --no-sandbox > /userdata/system/logs/4wd-simulator.log 2>&1
