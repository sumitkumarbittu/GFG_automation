#!/bin/zsh
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ '^[a-p]{32}$' ]]; then
  print -u2 "Usage: $0 <32-character Chrome extension ID>"
  exit 2
fi

extension_id="$1"
script_dir="${0:A:h}"
host_root="${script_dir:h}"
install_dir="$HOME/Library/Application Support/GFGTraversalLab"
manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
host_name="com.gfg.traversal_lab"

cargo build --release --manifest-path "$host_root/Cargo.toml"
mkdir -p "$install_dir" "$manifest_dir"
codesign --force --sign - --identifier com.gfg.traversal-lab.native-host "$host_root/target/release/gfg-traversal-native-host"
if ! cmp -s "$host_root/target/release/gfg-traversal-native-host" "$install_dir/gfg-traversal-native-host"; then
  cp "$host_root/target/release/gfg-traversal-native-host" "$install_dir/gfg-traversal-native-host"
fi
chmod 755 "$install_dir/gfg-traversal-native-host"

cat > "$manifest_dir/$host_name.json" <<EOF
{
  "name": "$host_name",
  "description": "GFG Traversal Lab OS input companion",
  "path": "$install_dir/gfg-traversal-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$extension_id/"]
}
EOF

print "Installed $host_name for Chrome extension $extension_id"
print "Restart Chrome and click Check native companion. macOS will request Accessibility access if it is missing."
