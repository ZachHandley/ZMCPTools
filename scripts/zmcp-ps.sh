#!/bin/bash

# ZMCP Process Status - Quick monitoring using process titles
# This is a simple process-only view. For full monitoring with database integration,
# use: zmcp-tools monitor

echo "ZMCP Agent Process Monitor (Simple View)"
echo "========================================"
echo "For full monitoring: zmcp-tools monitor"
echo ""

# Count total agents
total=$(ps aux | grep -E "zmcp-[a-z]{2}-" | grep -v grep | wc -l)
echo "Total ZMCP Agent Processes: $total"
echo ""

# Break down by type
echo "By Agent Type:"
echo "--------------"
ps aux | grep -E "zmcp-[a-z]{2}-" | grep -v grep | \
  awk -F- '{print $2}' | sort | uniq -c | \
  while read count type; do
    case $type in
      be) full="Backend" ;;
      fe) full="Frontend" ;;
      ts) full="Testing" ;;
      dc) full="Documentation" ;;
      ar) full="Architect" ;;
      dv) full="DevOps" ;;
      an) full="Analysis" ;;
      rs) full="Researcher" ;;
      im) full="Implementer" ;;
      rv) full="Reviewer" ;;
      *) full="Unknown($type)" ;;
    esac
    printf "%-15s %d\n" "$full:" "$count"
  done

echo ""
echo "Active Agent Processes:"
echo "-----------------------"
# Show all agents with formatted output
ps aux | grep -E "zmcp-[a-z]{2}-" | grep -v grep | \
  awk '{
    # Extract process title from command
    for(i=11; i<=NF; i++) {
      if($i ~ /^zmcp-/) {
        split($i, parts, "-")
        type = parts[2]
        project = parts[3]
        for(j=4; j<length(parts); j++) {
          if(parts[j] != "") project = project "-" parts[j]
        }
        id = parts[length(parts)]
        printf "%-4s %-25s %-8s PID:%-6s CPU:%-5s MEM:%-5s\n", 
          type, project, id, $2, $3"%", $4"%"
        break
      }
    }
  }'

echo ""
echo "Quick Commands:"
echo "---------------"
echo "Kill all agents:     pkill -f 'zmcp-'"
echo "Kill backend agents: pkill -f 'zmcp-be-'"
echo "Kill by project:     pkill -f 'zmcp-.*-<project>-'"
echo "Watch live:          watch $0"
echo ""
echo "Full Monitoring:"
echo "----------------"
echo "View with database:  zmcp-tools monitor"
echo "HTML dashboard:      zmcp-tools monitor -w -o html --port 8080"
echo "Watch mode:          zmcp-tools monitor -w"