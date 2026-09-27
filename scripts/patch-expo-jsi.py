import os

print("Applying Swift 6 / Xcode 16.4 compatibility patches to expo-modules-jsi...")

# 1. Fix 'weak let' / 'weak var' -> 'nonisolated(unsafe) weak var' for Sendable compliance in Swift 6
for root, _, files in os.walk('node_modules/expo-modules-jsi'):
    for f in files:
        if f.endswith('.swift'):
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                orig = content
                content = content.replace('weak let runtime:', 'nonisolated(unsafe) weak var runtime:')
                content = content.replace('weak var runtime:', 'nonisolated(unsafe) weak var runtime:')
                content = content.replace('weak let', 'weak var')
                content = content.replace('nonisolated(unsafe) nonisolated(unsafe)', 'nonisolated(unsafe)')
                if content != orig:
                    open(path, 'w', encoding='utf-8').write(content)
                    print(f"  Fixed weak / Sendable in: {path}")
            except Exception as e:
                print(f"  Error reading {path}: {e}")

# 2. Fix trailing comma in JavaScriptRuntime.swift
js_runtime = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptRuntime.swift')
if os.path.exists(js_runtime):
    content = open(js_runtime, 'r', encoding='utf-8').read()
    if '_ arguments: consuming JavaScriptValuesBuffer,' in content:
        content = content.replace('_ arguments: consuming JavaScriptValuesBuffer,', '_ arguments: consuming JavaScriptValuesBuffer')
        open(js_runtime, 'w', encoding='utf-8').write(content)
        print(f"  Fixed trailing comma in: {js_runtime}")

# 3. Fix SWIFT_RETURNS_RETAINED on constructors in RuntimeScheduler.h
sched = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h')
if os.path.exists(sched):
    content = open(sched, 'r', encoding='utf-8').read()
    content = content.replace('SWIFT_RETURNS_RETAINED RuntimeScheduler(', 'RuntimeScheduler(')
    content = content.replace('SWIFT_RETURNS_RETAINED RuntimeScheduler()', 'RuntimeScheduler()')
    open(sched, 'w', encoding='utf-8').write(content)
    print(f"  Fixed constructor annotations in: {sched}")

# 4. Fix swift-tools-version: 6.2 -> 6.0 in Package.swift files
for root, _, files in os.walk('node_modules'):
    for f in files:
        if f == 'Package.swift':
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                if 'swift-tools-version: 6.2' in content:
                    content = content.replace('swift-tools-version: 6.2', 'swift-tools-version: 6.0')
                    open(path, 'w', encoding='utf-8').write(content)
                    print(f"  Fixed swift-tools-version in: {path}")
            except Exception:
                pass

print("Finished applying expo-modules-jsi patches.")
