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
    # Use Swift 'consume' operator to move propNameId without extraneous label
    content = content.replace('vector.push_back(propNameId)', 'vector.push_back(consume propNameId)')
    content = content.replace('vector.push_back(consuming: propNameId)', 'vector.push_back(consume propNameId)')
    # Fix regex literal syntax parsing error on Swift 6
    content = content.replace(
        'name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil',
        'name.range(of: "^[a-zA-Z_$][a-zA-Z0-9_$]*$", options: .regularExpression) == nil'
    )
    # Fix RuntimeScheduler and HostFunctionClosure construction via static factory methods
    content = content.replace('self.scheduler = expo.RuntimeScheduler()', 'self.scheduler = expo.RuntimeScheduler.create()')
    content = content.replace('self.scheduler = expo.RuntimeScheduler(scheduler, fn)', 'self.scheduler = expo.RuntimeScheduler.create(scheduler, fn)')
    content = content.replace('return expo.HostFunctionClosure(context, call, deallocate)', 'return expo.HostFunctionClosure.create(context, call, deallocate)')
    if content != orig:
        open(js_runtime, 'w', encoding='utf-8').write(content)
        print(f"  Fixed syntax in: {js_runtime}")

# 4b. Fix Task+immediate.swift polyfill on Swift 6 / Xcode 16
task_imm = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Extensions', 'Task+immediate.swift')
if os.path.exists(task_imm):
    content = open(task_imm, 'r', encoding='utf-8').read()
    orig = content
    old_task = '''    if #available(macOS 26.0, iOS 26.0, watchOS 26.0, tvOS 26.0, *) {
      return Task.immediate(name: name, priority: priority, operation: operation)
    } else {
      // In the polyfill always use the highest priority and hope it executes earlier.
      return Task(name: name, priority: .high, operation: operation)
    }'''
    new_task = '    return Task(priority: priority ?? .high, operation: operation)'
    content = content.replace(old_task, new_task)
    if content != orig:
        open(task_imm, 'w', encoding='utf-8').write(content)
        print(f"  Fixed Task+immediate in: {task_imm}")

# 5. Fix JavaScriptActor.swift assumeIsolated / runIsolated cross-actor reference
js_actor = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI', 'Runtime', 'JavaScriptActor.swift')
if os.path.exists(js_actor):
    content = open(js_actor, 'r', encoding='utf-8').read()
    orig = content
    pattern = r'public static func assumeIsolated.*?internal static func runIsolated.*?\}\s*\}'
    replacement = """public static func assumeIsolated<T>(_ operation: @JavaScriptActor () -> T) -> T {
    checkIsolated()
    typealias YesActor = @JavaScriptActor () -> T
    typealias NoActor = () -> T
    return withoutActuallyEscaping(operation) { (_ fn: @escaping YesActor) -> T in
      let rawFn = unsafeBitCast(fn, to: NoActor.self)
      return rawFn()
    }
  }

  /// Throwing counterpart to the nonthrowing overload above. The generic error type keeps
  /// `operation` nonescaping while preserving the exact error it can throw.
  @_alwaysEmitIntoClient
  @inline(__always)
  public static func assumeIsolated<T, E: Error>(
    _ operation: @JavaScriptActor () throws(E) -> T
  ) throws(E) -> T {
    let result: Result<T, E> = assumeIsolated {
      return Result(catching: operation)
    }
    return try result.get()
  }

  /// In debug builds, asserts if the actor's executor is not isolating the current context.
  @inlinable
  @inline(__always)
  public static func checkIsolated() {
    assert(
      Thread.current.name == "com.facebook.react.runtime.JavaScript" || !Thread.isMultiThreaded()
        || ProcessInfo.processInfo.processName == "xctest",
      "JavaScriptActor operations must be run on the JavaScript thread"
    )
  }

  @usableFromInline
  internal static func runIsolated<T>(_ operation: @JavaScriptActor () -> T) -> T {
    return assumeIsolated(operation)
  }
}"""
    content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)
    if count > 0 and content != orig:
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

# 8. Fix RuntimeScheduler.h for Swift C++ shared reference interop
sched = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h')
if os.path.exists(sched):
    sched_content = """#pragma once

#ifdef __cplusplus

#include <atomic>
#include <swift/bridging>

namespace expo {
class RuntimeScheduler;
}

inline void retainRuntimeScheduler(expo::RuntimeScheduler *scheduler);
inline void releaseRuntimeScheduler(expo::RuntimeScheduler *scheduler);

namespace expo {

class SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler) RuntimeScheduler {
public:
  enum class Priority : int {
    ImmediatePriority = 1,
    UserBlockingPriority = 2,
    NormalPriority = 3,
    LowPriority = 4,
    IdlePriority = 5,
  };

  using ScheduleTaskCallback = void(^)();

  using ScheduleFn = void (*)(void *nativeScheduler, int priority, ScheduleTaskCallback callback);

private:
  void *const nativeScheduler{nullptr};
  const ScheduleFn scheduleFn{nullptr};

  std::atomic<int> refCount{1};

public:
  RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept
      : nativeScheduler(scheduler), scheduleFn(fn) {}

  RuntimeScheduler() {}

  static SWIFT_RETURNS_RETAINED RuntimeScheduler *create(void *scheduler, ScheduleFn fn) noexcept {
    return new RuntimeScheduler(scheduler, fn);
  }

  static SWIFT_RETURNS_RETAINED RuntimeScheduler *create() {
    return new RuntimeScheduler();
  }

  RuntimeScheduler(const RuntimeScheduler &) = delete;

  bool supportsAsyncScheduling() const noexcept {
    return scheduleFn != nullptr;
  }

  void scheduleTask(Priority priority, ScheduleTaskCallback callback) noexcept {
    if (scheduleFn != nullptr) {
      scheduleFn(nativeScheduler, static_cast<int>(priority), callback);
    } else {
      callback();
    }
  }

  void retain() {
    refCount.fetch_add(1, std::memory_order_relaxed);
  }

  void release() {
    if (refCount.fetch_sub(1, std::memory_order_acq_rel) == 1) {
      delete this;
    }
  }
};

} // namespace expo

inline void retainRuntimeScheduler(expo::RuntimeScheduler *scheduler) {
  scheduler->retain();
}

inline void releaseRuntimeScheduler(expo::RuntimeScheduler *scheduler) {
  scheduler->release();
}

#endif // __cplusplus
"""
    open(sched, 'w', encoding='utf-8').write(sched_content)
    print(f"  Fixed RuntimeScheduler.h in: {sched}")

# 9. Fix HostFunctionClosure.h for Swift C++ immortal reference interop
hfc = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostFunctionClosure.h')
if os.path.exists(hfc):
    hfc_content = """#pragma once

#include <swift/bridging>
#include <jsi/jsi.h>

#include "RetainedSwiftPointer.h"

namespace expo {

class SWIFT_IMMORTAL_REFERENCE HostFunctionClosure final : public RetainedSwiftPointer {
public:
  using Closure = bool(Context context, const facebook::jsi::Value *_Nonnull thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value *_Nonnull result);

  explicit HostFunctionClosure(Context context, Closure closure, Deallocator deallocator) : RetainedSwiftPointer(context, deallocator), _closure(closure) {};

  static SWIFT_RETURNS_UNRETAINED HostFunctionClosure *create(Context context, Closure closure, Deallocator deallocator) {
    return new HostFunctionClosure(context, closure, deallocator);
  }

  virtual ~HostFunctionClosure() {
    _deallocator(_context);
  }

  inline bool call(const facebook::jsi::Value &thisValue, const facebook::jsi::Value *_Nonnull args, size_t count, facebook::jsi::Value &result) const {
    return _closure(_context, &thisValue, args, count, &result);
  }

private:
  Closure *_Nonnull _closure;

}; // class HostFunctionClosure

} // namespace expo
"""
    open(hfc, 'w', encoding='utf-8').write(hfc_content)
    print(f"  Fixed HostFunctionClosure.h in: {hfc}")

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
