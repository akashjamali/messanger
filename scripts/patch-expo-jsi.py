import os

print("Applying Swift 6 & C++ interop patches to expo-modules-jsi...")

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

# 2. Fix syntax errors in JavaScriptRuntime.swift
js_runtime = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptRuntime.swift')
if os.path.exists(js_runtime):
    content = open(js_runtime, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('_ arguments: consuming JavaScriptValuesBuffer,', '_ arguments: consuming JavaScriptValuesBuffer')
    content = content.replace('vector.push_back(consuming: propNameId)', 'vector.push_back(propNameId)')
    if content != orig:
        open(js_runtime, 'w', encoding='utf-8').write(content)
        print(f"  Fixed syntax in: {js_runtime}")

# 3. Fix RuntimeScheduler.h attribute placement & constructor annotations
sched = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h')
if os.path.exists(sched):
    content = open(sched, 'r', encoding='utf-8').read()
    orig = content
    # Move SWIFT_SHARED_REFERENCE to class declaration
    if 'class SWIFT_SHARED_REFERENCE' not in content:
        content = content.replace('class RuntimeScheduler {', 'class SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler) RuntimeScheduler {')
    content = content.replace('} SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler);', '};')
    # Ensure constructors have SWIFT_RETURNS_RETAINED
    if 'SWIFT_RETURNS_RETAINED RuntimeScheduler(' not in content:
        content = content.replace('RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept', 'SWIFT_RETURNS_RETAINED RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept')
    if 'SWIFT_RETURNS_RETAINED RuntimeScheduler()' not in content:
        content = content.replace('RuntimeScheduler() {}', 'SWIFT_RETURNS_RETAINED RuntimeScheduler() {}')
    if content != orig:
        open(sched, 'w', encoding='utf-8').write(content)
        print(f"  Fixed attributes in: {sched}")

# 4. Fix HostFunctionClosure.h attribute placement & constructor annotations
hfc = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostFunctionClosure.h')
if os.path.exists(hfc):
    content = open(hfc, 'r', encoding='utf-8').read()
    orig = content
    if 'class SWIFT_IMMORTAL_REFERENCE' not in content:
        content = content.replace('class HostFunctionClosure final', 'class SWIFT_IMMORTAL_REFERENCE HostFunctionClosure final')
    content = content.replace('} SWIFT_IMMORTAL_REFERENCE;', '};')
    if 'SWIFT_RETURNS_UNRETAINED explicit HostFunctionClosure(' not in content:
        content = content.replace('explicit HostFunctionClosure(', 'SWIFT_RETURNS_UNRETAINED explicit HostFunctionClosure(')
    if content != orig:
        open(hfc, 'w', encoding='utf-8').write(content)
        print(f"  Fixed attributes in: {hfc}")

# 5. Fix Package.swift files (swift-tools-version: 6.0 and swiftLanguageModes: [.v5])
for root, _, files in os.walk('node_modules'):
    for f in files:
        if f == 'Package.swift':
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                orig = content
                content = content.replace('swift-tools-version: 6.2', 'swift-tools-version: 6.0')
                content = content.replace('swiftLanguageModes: [.v6]', 'swiftLanguageModes: [.v5]')
                if content != orig:
                    open(path, 'w', encoding='utf-8').write(content)
                    print(f"  Fixed Package.swift in: {path}")
            except Exception:
                pass

print("Finished applying expo-modules-jsi patches.")
