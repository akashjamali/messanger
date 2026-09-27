import os
import re

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

# 2. Fix HostFunctionContext and HostObjectContext Sendable warnings/errors
hfc_swift = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Contexts', 'HostFunctionContext.swift')
if os.path.exists(hfc_swift):
    content = open(hfc_swift, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('HostCallbackContext, Sendable', 'HostCallbackContext, @unchecked Sendable')
    if content != orig:
        open(hfc_swift, 'w', encoding='utf-8').write(content)
        print(f"  Fixed @unchecked Sendable in: {hfc_swift}")

hoc_swift = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Contexts', 'HostObjectContext.swift')
if os.path.exists(hoc_swift):
    content = open(hoc_swift, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('HostCallbackContext, Sendable', 'HostCallbackContext, @unchecked Sendable')
    if content != orig:
        open(hoc_swift, 'w', encoding='utf-8').write(content)
        print(f"  Fixed @unchecked Sendable in: {hoc_swift}")

# 3. Fix JavaScriptPromise.swift global actor LongLivedState initialization
promise_swift = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'Values', 'JavaScriptPromise.swift')
if os.path.exists(promise_swift):
    content = open(promise_swift, 'r', encoding='utf-8').read()
    orig = content
    if 'nonisolated init() {}' not in content:
        content = content.replace('private final class LongLivedState: LongLivedObject {', 'private final class LongLivedState: LongLivedObject {\n    nonisolated init() {}')
    if content != orig:
        open(promise_swift, 'w', encoding='utf-8').write(content)
        print(f"  Fixed LongLivedState init in: {promise_swift}")

# 4. Fix JavaScriptRuntime.swift syntax and regex
js_runtime = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptRuntime.swift')
if os.path.exists(js_runtime):
    content = open(js_runtime, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('_ arguments: consuming JavaScriptValuesBuffer,', '_ arguments: consuming JavaScriptValuesBuffer')
    content = content.replace('vector.push_back(consuming: propNameId)', 'vector.push_back(propNameId)')
    # Fix regex literal syntax parsing error on Xcode 16.2
    content = content.replace(
        'name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil',
        'name.range(of: "^[a-zA-Z_$][a-zA-Z0-9_$]*$", options: .regularExpression) == nil'
    )
    if content != orig:
        open(js_runtime, 'w', encoding='utf-8').write(content)
        print(f"  Fixed syntax in: {js_runtime}")

# 5. Fix JavaScriptActor.swift assumeIsolated / runIsolated cross-actor reference
js_actor = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptActor.swift')
if os.path.exists(js_actor):
    content = open(js_actor, 'r', encoding='utf-8').read()
    orig = content
    old_call = 'let runner = unsafeBitCast(runIsolated as IsolatedRunner, to: NonisolatedRunner.self)\n    return runner(operation)'
    new_call = 'return runIsolated(operation)'
    content = content.replace(old_call, new_call)
    old_def = '@JavaScriptActor\n  @usableFromInline\n  internal static func runIsolated<T: ~Copyable>(_ operation: @JavaScriptActor () -> T) -> T {\n    return operation()\n  }'
    new_def = '@usableFromInline\n  internal static func runIsolated<T: ~Copyable>(_ operation: @JavaScriptActor () -> T) -> T {\n    return withoutActuallyEscaping(operation) { escapableOperation in\n      typealias NonisolatedFn = () -> T\n      let fn = unsafeBitCast(escapableOperation, to: NonisolatedFn.self)\n      return fn()\n    }\n  }'
    content = content.replace(old_def, new_def)
    if content != orig:
        open(js_actor, 'w', encoding='utf-8').write(content)
        print(f"  Fixed actor isolation in: {js_actor}")

# 6. Remove redundant ', Escapable' protocol requirement in Swift 6.0
for path in [
    os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptRef.swift'),
    os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'Values', 'JavaScriptValue.swift')
]:
    if os.path.exists(path):
        content = open(path, 'r', encoding='utf-8').read()
        orig = content
        content = content.replace(', Escapable', '')
        if content != orig:
            open(path, 'w', encoding='utf-8').write(content)
            print(f"  Removed Escapable in: {path}")

# 7. Fix CppError library evolution error in JavaScriptError.swift
js_error = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'Values', 'JavaScriptError.swift')
if os.path.exists(js_error):
    content = open(js_error, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('extension expo.CppError: Error {\n  public var message: String {', 'extension expo.CppError: Error {\n  var message: String {')
    if content != orig:
        open(js_error, 'w', encoding='utf-8').write(content)
        print(f"  Fixed CppError extension in: {js_error}")

# 8. Fix RuntimeScheduler.h for Xcode 16.2
sched = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h')
if os.path.exists(sched):
    content = open(sched, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('SWIFT_RETURNS_RETAINED ', '')
    content = content.replace('class SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler) RuntimeScheduler {', 'class RuntimeScheduler {')
    if '} SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler);' not in content:
        content = content.replace('};\n\n} // namespace expo', '} SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler);\n\n} // namespace expo')
        content = content.replace('};\n} // namespace expo', '} SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler);\n\n} // namespace expo')
    if content != orig:
        open(sched, 'w', encoding='utf-8').write(content)
        print(f"  Fixed attributes in: {sched}")

# 9. Fix HostFunctionClosure.h (restore original immortal reference)
hfc = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostFunctionClosure.h')
if os.path.exists(hfc):
    content = open(hfc, 'r', encoding='utf-8').read()
    orig = content
    content = content.replace('class SWIFT_IMMORTAL_REFERENCE HostFunctionClosure final', 'class HostFunctionClosure final')
    content = content.replace('SWIFT_RETURNS_UNRETAINED explicit HostFunctionClosure', 'explicit HostFunctionClosure')
    if '} SWIFT_IMMORTAL_REFERENCE; // class HostFunctionClosure' not in content:
        content = content.replace('}; // class HostFunctionClosure', '} SWIFT_IMMORTAL_REFERENCE; // class HostFunctionClosure')
    if content != orig:
        open(hfc, 'w', encoding='utf-8').write(content)
        print(f"  Restored HostFunctionClosure in: {hfc}")

# 10. Fix Package.swift files (swift-tools-version: 6.0, swiftLanguageModes: [.v5], and strip trailing commas before ')')
for root, _, files in os.walk('node_modules'):
    for f in files:
        if f == 'Package.swift':
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                orig = content
                content = content.replace('swift-tools-version: 6.2', 'swift-tools-version: 6.0')
                content = content.replace('swiftLanguageModes: [.v6]', 'swiftLanguageModes: [.v5]')
                content = re.sub(r',\s*\)', ')', content)
                if content != orig:
                    open(path, 'w', encoding='utf-8').write(content)
                    print(f"  Fixed Package.swift in: {path}")
            except Exception as e:
                print(f"  Error fixing {path}: {e}")

print("Finished applying expo-modules-jsi patches.")
