#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate local-data.js with embedded data/*.json for file:// usage.

Only the JSON index is embedded. Post bodies are intentionally NOT embedded:
blog/posts/*.md is fetched at read time, so reading a post needs a local server
even for file:// usage (`python -m http.server 8000`). Embedding every post body
made this file grow to ~214 KB once the archive got past a few dozen posts, and it
is loaded on every page of the site.
"""
import json
import os
import glob

ROOT = os.path.dirname(os.path.abspath(__file__))

store = {}

# JSON data files
for json_file in glob.glob(os.path.join(ROOT, 'data', '*.json')):
    name = os.path.basename(json_file)
    key = f'data/{name}'
    with open(json_file, 'r', encoding='utf-8') as f:
        store[key] = json.load(f)

parts = []
parts.append('// Auto-generated: window.__localStore only, for file:// usage.')
parts.append('// Post bodies are NOT embedded (see the module docstring).')
parts.append('// Loaders live in local-loaders.js — include that script on any page that')
parts.append('// calls loadLocalData / loadLocalText.')
parts.append('// Regenerate with: python generate_local_data.py')
parts.append('window.__localStore = ' + json.dumps(store, ensure_ascii=False, indent=2) + ';')

output = '\n'.join(parts)
output_path = os.path.join(ROOT, 'local-data.js')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(output)
print(f'Generated {output_path} ({len(output.encode("utf-8"))} bytes)')
