#!/bin/zsh
set -euo pipefail

rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gfg.traversal_lab.json"
rm -f "$HOME/Library/Application Support/GFGTraversalLab/gfg-traversal-native-host"
print "Removed the GFG Traversal Lab native companion. Accessibility permission can be removed separately in System Settings."

