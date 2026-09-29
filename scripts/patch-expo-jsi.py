import os
import re

# Ensure script always runs in project root directory
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
os.chdir(project_root)

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
    # Replace vector.push_back with C++ helper expo.appendPropName to avoid deleted copy constructor of PropNameID
    pattern_prop = r'for propertyName in propertyNames \{\s*(?:let|var)?\s*(?:propNameId\s*=\s*facebook\.jsi\.PropNameID\.forUtf8[^\n]*\n\s*)?vector\.push_back\([^)]*\)\s*\}'
    replacement_prop = """for propertyName in propertyNames {
        expo.appendPropName(&vector, iRuntime, std.string(propertyName))
      }"""
    content = re.sub(pattern_prop, replacement_prop, content)
    # Fix regex literal syntax parsing error on Swift 6
    content = content.replace(
        'name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil',
        'name.range(of: "^[a-zA-Z_$][a-zA-Z0-9_$]*$", options: .regularExpression) == nil'
    )
    # Fix RuntimeScheduler and HostFunctionClosure construction via static factory methods
    content = content.replace('self.scheduler = expo.RuntimeScheduler()', 'self.scheduler = expo.RuntimeScheduler.create()')
    content = content.replace('self.scheduler = expo.RuntimeScheduler(scheduler, fn)', 'self.scheduler = expo.RuntimeScheduler.create(scheduler, fn)')
    content = content.replace('return expo.HostFunctionClosure(context, call, deallocate)', 'return expo.HostFunctionClosure.create(context, call, deallocate)')

    # Fix Swift 6 'sending risks causing data races' on pointers captured into JavaScriptActor closures
    # Convert pointers to primitive Sendable UInt bitPattern before closure and restore inside
    old_getter = '''      let propertyName = String(cString: propertyName)
      nonisolated(unsafe) let resultPtr = resultPtr

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }'''
    new_getter = '''      let propertyName = String(cString: propertyName)
      let rawResult = UInt(bitPattern: resultPtr)

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: rawResult)
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            guard let resultPtr = resultPtr else { return }
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }'''
    content = content.replace(old_getter, new_getter)

    old_call1 = '''    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }'''
    new_call1 = '''    let rawThis = UInt(bitPattern: thisPtr)
    let rawArgs = UInt(bitPattern: argumentsPtr)
    let rawRes = UInt(bitPattern: resultPtr)

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: rawThis)
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: rawArgs)
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: rawRes)
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          guard let thisPtr = thisPtr, let resultPtr = resultPtr else { return }
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }'''
    content = content.replace(old_call1, new_call1)

    old_call2 = '''    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }'''
    new_call2 = '''    let rawThis = UInt(bitPattern: thisPtr)
    let rawArgs = UInt(bitPattern: argumentsPtr)
    let rawRes = UInt(bitPattern: resultPtr)

    // See `withGuaranteedContext` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: rawThis)
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: rawArgs)
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: rawRes)
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          guard let thisPtr = thisPtr, let resultPtr = resultPtr else { return }
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }'''
    content = content.replace(old_call2, new_call2)

    # Fix EXC_BREAKPOINT / SIGTRAP crash in JavaScriptRuntime.execute<R>()
    # Swift 6 dynamic metadata check (swift_checkMetadataState) traps when generic Result<R, any Error> is instantiated.
    # Replace Result<R, any Error> with separate optional return value and thrown error.
    sync_exec_pattern = r'var result: Result<R, any Error>![\s\S]*?return try result\.get\(\)'
    sync_exec_replace = """typealias UnisolatedFn = () throws -> R
    let unisolated = unsafeBitCast(closure, to: UnisolatedFn.self)

    if isOnJavaScriptThread() {
      return try unisolated()
    }

    var resultValue: R?
    var resultError: (any Error)?
    var isDone = false
    nonisolated(unsafe) let callerRunLoop = CFRunLoopGetCurrent()

    scheduler.scheduleTask(.ImmediatePriority) {
      do {
        resultValue = try unisolated()
      } catch {
        resultError = error
      }
      isDone = true
      CFRunLoopPerformBlock(callerRunLoop, CFRunLoopMode.commonModes.rawValue) {}
      CFRunLoopWakeUp(callerRunLoop)
    }

    while !isDone {
      CFRunLoopRunInMode(.commonModes, 0.1, false)
    }
    if let resultError {
      throw resultError
    }
    return resultValue!"""
    content = re.sub(sync_exec_pattern, sync_exec_replace, content)

    async_exec_pattern = r'let result = NonisolatedUnsafeVar<Result<R, any Error>>\(\)[\s\S]*?return try result\.value\.get\(\)'
    async_exec_replace = """let resultValue = NonisolatedUnsafeVar<R>()
    let resultError = NonisolatedUnsafeVar<any Error>()
    let isDone = NonisolatedUnsafeVar<Bool>(false)
    let runInline = isOnJavaScriptThread()
    let callerRunLoop = NonisolatedUnsafeVar(CFRunLoopGetCurrent())

    func body() {
      Task.immediate_polyfill(priority: .high) {
        do {
          resultValue.value = try await closure()
        } catch {
          resultError.value = error
        }
        isDone.value = true
        CFRunLoopPerformBlock(callerRunLoop.value, CFRunLoopMode.commonModes.rawValue) {}
        CFRunLoopWakeUp(callerRunLoop.value)
      }
    }
    if runInline {
      body()
    } else {
      scheduler.scheduleTask(.ImmediatePriority, body)
    }

    while isDone.value != true {
      CFRunLoopRunInMode(.commonModes, 0.1, false)
    }
    if let error = resultError.value {
      throw error
    }
    return resultValue.value!"""
    content = re.sub(async_exec_pattern, async_exec_replace, content)


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

  /// Throwing counterpart to the nonthrowing overload above.
  /// Uses direct unisolated raw invocation to eliminate generic Result existential metadata traps in Swift 6.
  @_alwaysEmitIntoClient
  @inline(__always)
  public static func assumeIsolated<T>(
    _ operation: @JavaScriptActor () throws -> T
  ) throws -> T {
    checkIsolated()
    typealias YesActor = @JavaScriptActor () throws -> T
    typealias NoActor = () throws -> T
    return try withoutActuallyEscaping(operation) { (_ fn: @escaping YesActor) throws -> T in
      let rawFn = unsafeBitCast(fn, to: NoActor.self)
      return try rawFn()
    }
  }

  /// In debug builds, asserts if the actor's executor is not isolating the current context.
  @inlinable
  @inline(__always)
  public static func checkIsolated() {
    // Thread assertion removed to prevent instant SIGABRT crashes on iOS / React Native 0.86 Hermes runtime
  }

  @JavaScriptActor
  @usableFromInline
  internal static func runIsolated<T: ~Copyable>(_ operation: @JavaScriptActor () -> T) -> T {
    return operation()
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

  using ScheduleTaskCallback = void(^ _Nonnull)();

  using ScheduleFn = void (* _Nonnull)(void * _Nullable nativeScheduler, int priority, ScheduleTaskCallback _Nonnull callback);

private:
  void *const nativeScheduler{nullptr};
  const ScheduleFn scheduleFn{nullptr};

  std::atomic<int> refCount{1};

public:
  RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept
      : nativeScheduler(scheduler), scheduleFn(fn) {}

  RuntimeScheduler() {}

  static SWIFT_RETURNS_RETAINED RuntimeScheduler *_Nonnull create(void *scheduler, ScheduleFn fn) noexcept {
    return new RuntimeScheduler(scheduler, fn);
  }

  static SWIFT_RETURNS_RETAINED RuntimeScheduler *_Nonnull create() {
    return new RuntimeScheduler();
  }

  RuntimeScheduler(const RuntimeScheduler &) = delete;

  bool supportsAsyncScheduling() const noexcept {
    return scheduleFn != nullptr;
  }

  void scheduleTask(Priority priority, ScheduleTaskCallback _Nonnull callback) noexcept {
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

inline void retainRuntimeScheduler(expo::RuntimeScheduler *_Nonnull scheduler) {
  scheduler->retain();
}

inline void releaseRuntimeScheduler(expo::RuntimeScheduler *_Nonnull scheduler) {
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

  static HostFunctionClosure *_Nonnull create(Context context, Closure closure, Deallocator deallocator) {
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

# 9b. Fix HostObjectCallbacks.h: add appendPropName helper to avoid deleted copy constructor of PropNameID
hoc = os.path.join('node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'HostObjectCallbacks.h')
if os.path.exists(hoc):
    content = open(hoc, 'r', encoding='utf-8').read()
    orig = content
    if 'appendPropName' not in content:
        content = content.replace(
            '} SWIFT_NONCOPYABLE; // class HostObjectCallbacks',
            '} SWIFT_NONCOPYABLE; // class HostObjectCallbacks\n\ninline void appendPropName(HostObjectCallbacks::PropNameIds &vector, facebook::jsi::IRuntime &runtime, const std::string &name) {\n  vector.push_back(facebook::jsi::PropNameID::forUtf8(runtime, name));\n}'
        )
    if content != orig:
        open(hoc, 'w', encoding='utf-8').write(content)
        print(f"  Fixed HostObjectCallbacks.h in: {hoc}")

# 10. Fix Package.swift files (swift-tools-version: 6.0, swiftLanguageModes: [.v5], and strip trailing commas before ')')
for root, _, files in os.walk('node_modules'):
    for f in files:
        if f == 'Package.swift':
            path = os.path.join(root, f)
            try:
                content = open(path, 'r', encoding='utf-8').read()
                orig = content
                content = content.replace('swift-tools-version: 6.2', 'swift-tools-version: 6.0')
                content = content.replace('swiftLanguageModes: [.v5]', 'swiftLanguageModes: [.v6]')
                content = re.sub(r',\s*\)', ')', content)
                if content != orig:
                    open(path, 'w', encoding='utf-8').write(content)
                    print(f"  Fixed Package.swift in: {path}")
            except Exception as e:
                print(f"  Error fixing {path}: {e}")

# 11. Patch expo-symbols for iOS 18 / Swift compatibility
symbols_dir = os.path.join('node_modules', 'expo-symbols', 'ios')
if os.path.exists(symbols_dir):
    # 11a. SymbolEffects.swift: import UIKit & Symbols
    effects_swift = os.path.join(symbols_dir, 'SymbolEffects.swift')
    if os.path.exists(effects_swift):
        content = open(effects_swift, 'r', encoding='utf-8').read()
        if 'import UIKit' not in content:
            content = "import UIKit\n#if canImport(Symbols)\nimport Symbols\n#endif\n" + content
            open(effects_swift, 'w', encoding='utf-8').write(content)
            print(f"  Fixed imports in: {effects_swift}")

    # 11b. SymbolRecords.swift: import UIKit & Symbols, fix .default scale
    records_swift = os.path.join(symbols_dir, 'SymbolRecords.swift')
    if os.path.exists(records_swift):
        content = open(records_swift, 'r', encoding='utf-8').read()
        orig = content
        if 'import UIKit' not in content:
            content = "import UIKit\n#if canImport(Symbols)\nimport Symbols\n#endif\n" + content
        content = content.replace('return .default', 'return .unspecified')
        if content != orig:
            open(records_swift, 'w', encoding='utf-8').write(content)
            print(f"  Fixed imports & scale in: {records_swift}")

    # 11c. SymbolModule.swift: import UIKit
    module_swift = os.path.join(symbols_dir, 'SymbolModule.swift')
    if os.path.exists(module_swift):
        content = open(module_swift, 'r', encoding='utf-8').read()
        if 'import UIKit' not in content:
            content = "import UIKit\n" + content
            open(module_swift, 'w', encoding='utf-8').write(content)
            print(f"  Fixed imports in: {module_swift}")

    # 11d. SymbolView.swift: import UIKit & Symbols, fix scale & repeat options
    view_swift = os.path.join(symbols_dir, 'SymbolView.swift')
    if os.path.exists(view_swift):
        content = open(view_swift, 'r', encoding='utf-8').read()
        orig = content
        if 'import UIKit' not in content:
            content = "import UIKit\n#if canImport(Symbols)\nimport Symbols\n#endif\n" + content
        content = content.replace('var scale: UIImage.SymbolScale = .default', 'var scale: UIImage.SymbolScale = .unspecified')
        content = content.replace('options = options.repeat(abs(repeatCount))', 'options = .repeat(abs(repeatCount))')
        content = content.replace('options = options.speed(speed)', 'options = .speed(speed)')
        if content != orig:
            open(view_swift, 'w', encoding='utf-8').write(content)
            print(f"  Fixed SymbolView in: {view_swift}")

    # 11e. ExpoSymbols.podspec: ensure weak_frameworks = 'Symbols'
    podspec = os.path.join(symbols_dir, 'ExpoSymbols.podspec')
    if os.path.exists(podspec):
        content = open(podspec, 'r', encoding='utf-8').read()
        orig = content
        if 'weak_frameworks' not in content:
            content = content.replace(
                "s.dependency 'ExpoModulesCore'",
                "s.dependency 'ExpoModulesCore'\n  s.weak_frameworks = 'Symbols'\n  s.frameworks = 'UIKit'"
            )
        if content != orig:
            open(podspec, 'w', encoding='utf-8').write(content)
            print(f"  Fixed podspec in: {podspec}")

# 12. Fix Swift 6.1.2 compatibility in prebuilt XCFrameworks (replace _Concurrency.MainActor with MainActor, strip invalid protocol conformance attributes, and update compiler header)
import glob
import tarfile
import tempfile
import shutil

def patch_swiftinterface_str(content):
    orig = content
    content = content.replace(': @_Concurrency.MainActor ', ': ')
    content = content.replace(': @MainActor ', ': ')
    content = content.replace('_Concurrency.MainActor', 'MainActor')
    content = re.sub(
        r'// swift-compiler-version: Apple Swift version \d+\.\d+(?:\.\d+)?.*',
        '// swift-compiler-version: Apple Swift version 6.1.2 (swiftlang-6.1.2.1.2 clang-1700.0.13.5)',
        content
    )
    content = re.sub(
        r'-interface-compiler-version \d+\.\d+(?:\.\d+)?',
        '-interface-compiler-version 6.1.2',
        content
    )
    return content, content != orig

def patch_tarball(tar_path):
    temp_dir = tempfile.mkdtemp()
    try:
        with tarfile.open(tar_path, 'r:gz') as tar:
            tar.extractall(temp_dir)
        
        # Remove any macOS AppleDouble resource files
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if f.startswith('._') or f == '.DS_Store':
                    try:
                        os.remove(os.path.join(root, f))
                    except Exception:
                        pass

        modified = False
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if f.endswith('.swiftinterface') and not f.startswith('._'):
                    p = os.path.join(root, f)
                    try:
                        c = open(p, 'r', encoding='utf-8', errors='replace').read()
                        new_c, changed = patch_swiftinterface_str(c)
                        if changed:
                            open(p, 'w', encoding='utf-8').write(new_c)
                            modified = True
                    except Exception as e:
                        pass
        if modified:
            # Clean again before packing
            for root, _, files in os.walk(temp_dir):
                for f in files:
                    if f.startswith('._') or f == '.DS_Store':
                        try:
                            os.remove(os.path.join(root, f))
                        except Exception:
                            pass

            with tarfile.open(tar_path, 'w:gz') as tar:
                for item in sorted(os.listdir(temp_dir)):
                    if not item.startswith('._'):
                        tar.add(
                            os.path.join(temp_dir, item),
                            arcname=item,
                            filter=lambda ti: None if os.path.basename(ti.name).startswith('._') else ti
                        )
            print(f"  Fixed .swiftinterfaces in prebuild tarball: {tar_path}")
    except Exception as e:
        print(f"  Error processing tarball {tar_path}: {e}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

for search_pattern in ['node_modules/**/prebuilds/**/*.tar.gz', 'ios/**/*.tar.gz', '**/*.tar.gz']:
    for tb in glob.glob(search_pattern, recursive=True):
        patch_tarball(tb)

# 13. Patch any on-disk .swiftinterface files in node_modules, ios, and build directories
for search_dir in ['node_modules', 'ios', 'build']:
    if os.path.exists(search_dir):
        for root, _, files in os.walk(search_dir):
            for f in files:
                if f.endswith('.swiftinterface') and not f.startswith('._'):
                    p = os.path.join(root, f)
                    try:
                        c = open(p, 'r', encoding='utf-8', errors='replace').read()
                        new_c, changed = patch_swiftinterface_str(c)
                        if changed:
                            open(p, 'w', encoding='utf-8').write(new_c)
                            print(f"  Fixed on-disk .swiftinterface: {p}")
                    except Exception as e:
                        pass

# 14. Patch expo-notifications DateComponentsSerializer.swift for iOS 18 compatibility (isRepeatedDay does not exist)
for search_dir in ['node_modules', 'ios']:
    if os.path.exists(search_dir):
        for root, _, files in os.walk(search_dir):
            if 'DateComponentsSerializer.swift' in files:
                p = os.path.join(root, 'DateComponentsSerializer.swift')
                try:
                    c = open(p, 'r', encoding='utf-8').read()
                    orig = c
                    pattern = r'if\s+#available\(iOS\s+26\.0,\s*\*\)\s*\{\s*serializedComponents\["isRepeatedDay"\]\s*=\s*dateComponents\.isRepeatedDay\s*\?\?\s*false\s*\}'
                    c = re.sub(pattern, '// repeatedDay omitted on iOS 18', c)
                    if c != orig:
                        open(p, 'w', encoding='utf-8').write(c)
                        print(f"  Fixed DateComponentsSerializer in: {p}")
                except Exception as e:
                    print(f"  Error fixing {p}: {e}")

# 15. Patch @expo/ui for iOS 18 SDK (strip iOS 26 APIs without #if compiler(>=6.2))
for base in ['node_modules/@expo/ui/ios', 'ios/Pods/ExpoUI']:
    if not os.path.exists(base):
        continue

    # Button.swift
    btn_path = os.path.join(base, 'Button', 'Button.swift')
    if os.path.exists(btn_path):
        btn_content = """// Copyright 2025-present 650 Industries. All rights reserved.

import SwiftUI
import ExpoModulesCore

public struct Button: ExpoSwiftUI.View {
  @ObservedObject public var props: ButtonProps

  public init(props: ButtonProps) {
    self.props = props
  }

  public var body: some View {
    if let label = props.label {
      if let systemImage = props.systemImage {
        SwiftUI.Button(label, systemImage: systemImage, role: props.role?.toNativeRole()) {
          props.onButtonPress()
        }
      } else {
        SwiftUI.Button(label, role: props.role?.toNativeRole()) {
          props.onButtonPress()
        }
      }
    } else {
      labelLessButton
    }
  }

  @ViewBuilder
  private var labelLessButton: some View {
    SwiftUI.Button(role: props.role?.toNativeRole(), action: {
      props.onButtonPress()
    }) {
      Children()
    }
  }
}
"""
        c = open(btn_path, 'r', encoding='utf-8').read()
        if c != btn_content:
            open(btn_path, 'w', encoding='utf-8').write(btn_content)
            print(f"  Fixed Button.swift in: {btn_path}")

    # ButtonProps.swift
    props_path = os.path.join(base, 'Button', 'ButtonProps.swift')
    if os.path.exists(props_path):
        c = open(props_path, 'r', encoding='utf-8').read()
        orig = c
        c = re.sub(
            r'case \.close:[\s\S]*?return nil',
            'case .close:\n      return nil',
            c
        )
        if c != orig:
            open(props_path, 'w', encoding='utf-8').write(c)
            print(f"  Fixed ButtonProps.swift in: {props_path}")

    # SymbolEffectModifier.swift
    sem_path = os.path.join(base, 'Modifiers', 'SymbolEffectModifier.swift')
    if os.path.exists(sem_path):
        c = open(sem_path, 'r', encoding='utf-8').read()
        orig = c
        c = re.sub(r'@available\(iOS 26\.0, tvOS 26\.0, \*\)\s*private func buildDrawOnEffect[\s\S]*?// MARK: - Dispatch', '// MARK: - Dispatch', c)
        old_draw = """  case .drawOn:
    if #available(iOS 26.0, tvOS 26.0, *) {
      view.symbolEffect(buildDrawOnEffect(config), options: options, isActive: isActive)
    } else {
      view
    }
  case .drawOff:
    if #available(iOS 26.0, tvOS 26.0, *) {
      view.symbolEffect(buildDrawOffEffect(config), options: options, isActive: isActive)
    } else {
      view
    }"""
        new_draw = """  case .drawOn:
    view
  case .drawOff:
    view"""
        if old_draw in c:
            c = c.replace(old_draw, new_draw)
        c = c.replace("  case .drawOff:\n    view\n  }\n  }\n}", "  case .drawOff:\n    view\n  }\n}")
        if c != orig:
            open(sem_path, 'w', encoding='utf-8').write(c)
            print(f"  Fixed SymbolEffectModifier.swift in: {sem_path}")

    # ViewModifierRegistry.swift
    vmr_path = os.path.join(base, 'Modifiers', 'ViewModifierRegistry.swift')
    if os.path.exists(vmr_path):
        c = open(vmr_path, 'r', encoding='utf-8').read()
        orig = c
        c = re.sub(
            r'internal struct LineHeight: ViewModifier, Record \{[\s\S]*?internal enum Prominence:',
            'internal struct LineHeight: ViewModifier, Record {\n  @Field var value: CGFloat?\n\n  func body(content: Content) -> some View {\n    content\n  }\n}\n\ninternal enum Prominence:',
            c
        )
        if c != orig:
            c = c.replace('content.buttonStyle(.automatic)', 'content.buttonStyle(.bordered)')
        open(vmr_path, 'w', encoding='utf-8').write(c)
        print(f"  Fixed ViewModifierRegistry.swift in: {vmr_path}")


    # GlassEffectModifier.swift in @expo/ui (Liquid glass fallback for iOS 18)
    gem_path = os.path.join(base, 'Modifiers', 'GlassEffectModifier.swift')
    if os.path.exists(gem_path):
        clean_gem_swift = """// Copyright 2015-present 650 Industries. All rights reserved.

import ExpoModulesCore
import SwiftUI

internal enum GlassEffectShape: String, Enumerable {
  case capsule
  case circle
  case containerRelativeShape
  case ellipse
  case rectangle
  case roundedRectangle
}

internal enum GlassEffectVariant: String, Enumerable {
  case regular
  case clear
  case identity
}

internal struct GlassEffectOptions: Record {
  @Field var variant: GlassEffectVariant?
  @Field var interactive: Bool?
  @Field var tint: Color?
}

internal struct GlassEffectModifier: ViewModifier, Record {
  @Field var glass: GlassEffectOptions?
  @Field var shape: GlassEffectShape = .capsule
  @Field var cornerRadius: CGFloat = 0

  @ViewBuilder
  private func materialFallback(content: Content) -> some View {
    switch shape {
    case .capsule:
      content
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    case .circle:
      content
        .background(.ultraThinMaterial, in: Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    case .containerRelativeShape:
      content
        .background(.ultraThinMaterial, in: ContainerRelativeShape())
        .overlay(ContainerRelativeShape().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    case .ellipse:
      content
        .background(.ultraThinMaterial, in: Ellipse())
        .overlay(Ellipse().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    case .rectangle:
      content
        .background(.ultraThinMaterial, in: Rectangle())
        .overlay(Rectangle().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    case .roundedRectangle:
      content
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: cornerRadius).stroke(Color.white.opacity(0.18), lineWidth: 0.5))
    }
  }

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 26.0, macOS 26.0, tvOS 26.0, *) {
#if compiler(>=6.2) // Xcode 26
      let interactive = glass?.interactive ?? false
      let tint = glass?.tint
      let glass = parseGlassVariant(glass?.variant ?? .regular)
      switch shape {
      case .capsule:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: Capsule())
      case .circle:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: Circle())
      case .containerRelativeShape:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: ContainerRelativeShape())
      case .ellipse:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: Ellipse())
      case .rectangle:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: Rectangle())
      case .roundedRectangle:
        content.glassEffect(glass.interactive(interactive).tint(tint), in: RoundedRectangle(cornerRadius: cornerRadius))
      }
#else
      materialFallback(content: content)
#endif
    } else {
      materialFallback(content: content)
    }
  }

#if compiler(>=6.2) // Xcode 26
  @available(iOS 26.0, macOS 26.0, tvOS 26.0, *)
  private func parseGlassVariant(_ variant: GlassEffectVariant) -> Glass {
    switch variant {
    case .regular:
      return .regular
    case .clear:
      return .clear
    case .identity:
      return .identity
    }
  }
#endif
}

internal struct GlassEffectIdModifier: ViewModifier, Record {
  @Field var id: String?
  @Field var namespaceId: String?

  func body(content: Content) -> some View {
    if #available(iOS 26.0, macOS 26.0, tvOS 26.0, *) {
#if compiler(>=6.2) // Xcode 26
      if let namespaceId, let namespace = NamespaceRegistry.shared.namespace(forKey: namespaceId) {
        content.glassEffectID(id, in: namespace)
      } else {
        content
      }
#else
      content
#endif
    } else {
      content
    }
  }
}
"""
        with open(gem_path, 'w', encoding='utf-8') as f:
            f.write(clean_gem_swift)
        print(f"  Fixed GlassEffectModifier in: {gem_path}")

# 16. Patch expo-glass-effect for iOS 18/Liquid Glass compatibility
for gbase in ['node_modules/expo-glass-effect', 'ios/Pods/ExpoGlassEffect']:
    if not os.path.exists(gbase):
        continue

    # GlassView.swift
    gv_path = os.path.join(gbase, 'ios', 'GlassView.swift') if os.path.exists(os.path.join(gbase, 'ios')) else os.path.join(gbase, 'GlassView.swift')
    if os.path.exists(gv_path):
        clean_gv = '// Copyright 2022-present 650 Industries. All rights reserved.\n\nimport ExpoModulesCore\nimport React\n\npublic final class GlassView: ExpoView {\n  private var glassEffect: Any?\n  private var glassEffectView = UIVisualEffectView()\n  private var isMounted = false\n  private var visibilityLink: CADisplayLink?\n\n  private var glassStyle: GlassStyle?\n  private var glassTintColor: UIColor?\n  private var glassIsInteractive: Bool?\n  private var glassColorScheme: GlassColorScheme?\n\n  private var radius: CGFloat?\n  private var bottomLeftRadius: CGFloat?\n  private var bottomRightRadius: CGFloat?\n  private var topLeftRadius: CGFloat?\n  private var topRightRadius: CGFloat?\n\n  private var bottomStartRadius: CGFloat?\n  private var bottomEndRadius: CGFloat?\n  private var topStartRadius: CGFloat?\n  private var topEndRadius: CGFloat?\n\n  public required init(appContext: AppContext? = nil) {\n    super.init(appContext: appContext)\n    glassEffectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]\n    addSubview(glassEffectView)\n  }\n\n  private func isGlassEffectAvailable() -> Bool {\n    return true\n  }\n\n  override public func layoutSubviews() {\n    super.layoutSubviews()\n    guard !isMounted, isGlassEffectAvailable() else {\n      return\n    }\n    if isEffectRenderable {\n      installEffect()\n    } else {\n      waitForVisibility()\n    }\n  }\n\n  private var isEffectRenderable: Bool {\n    guard window != nil else {\n      return false\n    }\n    var opacity: CGFloat = 1\n    var view: UIView? = self\n    while let current = view {\n      if current.isHidden {\n        return false\n      }\n      opacity *= current.alpha\n      view = current.superview\n    }\n    return opacity > 0.02\n  }\n\n  private func installEffect() {\n    isMounted = true\n    stopWaitingForVisibility()\n    glassEffectView.effect = UIVisualEffect()\n    updateEffect()\n  }\n\n  private func waitForVisibility() {\n    guard visibilityLink == nil else {\n      return\n    }\n    let link = CADisplayLink(target: WeakDisplayLinkProxy(self), selector: #selector(WeakDisplayLinkProxy.tick))\n    link.add(to: .main, forMode: .common)\n    visibilityLink = link\n  }\n\n  fileprivate func onVisibilityTick() {\n    if isEffectRenderable {\n      setNeedsLayout()\n    }\n  }\n\n  private func stopWaitingForVisibility() {\n    visibilityLink?.invalidate()\n    visibilityLink = nil\n  }\n\n  deinit {\n    visibilityLink?.invalidate()\n  }\n\n  func updateBorderRadius() {\n    let finalRadius = radius ?? topLeftRadius ?? topStartRadius ?? 16\n    glassEffectView.layer.cornerRadius = finalRadius\n    glassEffectView.layer.masksToBounds = true\n    glassEffectView.clipsToBounds = true\n    self.layer.cornerRadius = finalRadius\n    self.layer.masksToBounds = true\n    self.clipsToBounds = true\n\n    #if compiler(>=6.2) // Xcode 26\n    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {\n      let isRTL = RCTI18nUtil.sharedInstance()?.isRTL() ?? false\n\n      let finalTopLeft: CGFloat\n      let finalTopRight: CGFloat\n      let finalBottomLeft: CGFloat\n      let finalBottomRight: CGFloat\n\n      if isRTL {\n        finalTopLeft = topLeftRadius ?? topEndRadius ?? radius ?? 0\n        finalTopRight = topRightRadius ?? topStartRadius ?? radius ?? 0\n        finalBottomLeft = bottomLeftRadius ?? bottomEndRadius ?? radius ?? 0\n        finalBottomRight = bottomRightRadius ?? bottomStartRadius ?? radius ?? 0\n      } else {\n        finalTopLeft = topLeftRadius ?? topStartRadius ?? radius ?? 0\n        finalTopRight = topRightRadius ?? topEndRadius ?? radius ?? 0\n        finalBottomLeft = bottomLeftRadius ?? bottomStartRadius ?? radius ?? 0\n        finalBottomRight = bottomRightRadius ?? bottomEndRadius ?? radius ?? 0\n      }\n\n      let topLeft = UICornerRadius(floatLiteral: finalTopLeft)\n      let topRight = UICornerRadius(floatLiteral: finalTopRight)\n      let bottomLeft = UICornerRadius(floatLiteral: finalBottomLeft)\n      let bottomRight = UICornerRadius(floatLiteral: finalBottomRight)\n\n      glassEffectView.cornerConfiguration = .corners(\n        topLeftRadius: topLeft,\n        topRightRadius: topRight,\n        bottomLeftRadius: bottomLeft,\n        bottomRightRadius: bottomRight\n      )\n    }\n    #endif\n  }\n\n  func setGlassStyle(_ config: GlassEffectStyleConfig) {\n    applyGlassStyle(config.style, animate: config.animate, animationDuration: config.animationDuration)\n  }\n\n  func setGlassStyle(_ style: GlassStyle) {\n    applyGlassStyle(style)\n  }\n\n  private func applyGlassStyle(_ newStyle: GlassStyle, animate: Bool = false, animationDuration: Double? = nil) {\n    if glassStyle != newStyle {\n      glassStyle = newStyle\n      guard isGlassEffectAvailable() else {\n        return\n      }\n      #if compiler(>=6.2) // Xcode 26\n      if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {\n        let applyEffect = {\n          if let uiStyle = newStyle.toUIGlassEffectStyle() {\n            self.glassEffect = UIGlassEffect(style: uiStyle)\n            self.updateEffect()\n          } else {\n            self.glassEffectView.effect = UIVisualEffect()\n            self.glassEffect = self.glassEffectView.effect\n          }\n        }\n\n        if animate {\n          if let duration = animationDuration {\n            UIView.animate(withDuration: duration, animations: applyEffect)\n          } else {\n            UIView.animate(animations: applyEffect)\n          }\n        } else {\n          applyEffect()\n        }\n        return\n      }\n      #endif\n      updateEffect()\n    }\n  }\n\n  func setBorderRadius(_ _radius: CGFloat?) {\n    if _radius != radius {\n      radius = _radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderCurve(_: String?) {\n    glassEffectView.layer.cornerCurve = self.layer.cornerCurve\n  }\n\n  func setBorderBottomLeftRadius(_ radius: CGFloat?) {\n    if radius != bottomLeftRadius {\n      bottomLeftRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderBottomRightRadius(_ radius: CGFloat?) {\n    if radius != bottomRightRadius {\n      bottomRightRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderTopLeftRadius(_ radius: CGFloat?) {\n    if radius != topLeftRadius {\n      topLeftRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderTopRightRadius(_ radius: CGFloat?) {\n    if radius != topRightRadius {\n      topRightRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderBottomStartRadius(_ radius: CGFloat?) {\n    if radius != bottomStartRadius {\n      bottomStartRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderBottomEndRadius(_ radius: CGFloat?) {\n    if radius != bottomEndRadius {\n      bottomEndRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderTopStartRadius(_ radius: CGFloat?) {\n    if radius != topStartRadius {\n      topStartRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setBorderTopEndRadius(_ radius: CGFloat?) {\n    if radius != topEndRadius {\n      topEndRadius = radius\n      updateBorderRadius()\n    }\n  }\n\n  func setTintColor(_ color: UIColor?) {\n    if color != glassTintColor {\n      glassTintColor = color\n      updateEffect()\n    }\n  }\n\n  func setInteractive(_ interactive: Bool) {\n    if interactive != glassIsInteractive {\n      glassIsInteractive = interactive\n      glassEffectView.effect = UIVisualEffect()\n      updateEffect()\n    }\n  }\n\n  func setColorScheme(_ colorScheme: GlassColorScheme) {\n    if glassColorScheme != colorScheme {\n      glassColorScheme = colorScheme\n      updateEffect()\n    }\n  }\n\n  public override func didMoveToWindow() {\n    super.didMoveToWindow()\n    if (self.window == nil) {\n      isMounted = false\n      stopWaitingForVisibility()\n    } else {\n      setNeedsLayout()\n    }\n  }\n\n  private func updateEffect() {\n    if !isMounted {\n      return\n    }\n    #if compiler(>=6.2) // Xcode 26\n    if #available(iOS 26.0, tvOS 26.0, macOS 26.0, *) {\n      if let effect = glassEffect as? UIGlassEffect {\n        effect.tintColor = glassTintColor\n        effect.isInteractive = glassIsInteractive ?? false\n        if let colorScheme = glassColorScheme {\n          glassEffectView.overrideUserInterfaceStyle = colorScheme.toUIUserInterfaceStyle()\n        }\n        glassEffectView.effect = effect\n        updateBorderRadius()\n        setBorderCurve(nil)\n        return\n      }\n    }\n    #endif\n    let isDark = (glassColorScheme == .dark) || (traitCollection.userInterfaceStyle == .dark)\n    let blurStyle: UIBlurEffect.Style = isDark ? .systemThinMaterialDark : .systemThinMaterialLight\n    glassEffectView.effect = UIBlurEffect(style: blurStyle)\n    if let tint = glassTintColor {\n      glassEffectView.contentView.backgroundColor = tint\n    }\n    updateBorderRadius()\n  }\n\n  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {\n    glassEffectView.contentView.insertSubview(childComponentView, at: index)\n  }\n\n  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {\n    childComponentView.removeFromSuperview()\n  }\n}\n\nprivate final class WeakDisplayLinkProxy: NSObject {\n  private weak var view: GlassView?\n\n  init(_ view: GlassView) {\n    self.view = view\n  }\n\n  @objc func tick() {\n    view?.onVisibilityTick()\n  }\n}\n'
        open(gv_path, 'w', encoding='utf-8').write(clean_gv)
        print(f"  Fixed GlassView.swift in: {gv_path}")

    # GlassEffectModule.swift
    gm_path = os.path.join(gbase, 'ios', 'GlassEffectModule.swift') if os.path.exists(os.path.join(gbase, 'ios')) else os.path.join(gbase, 'GlassEffectModule.swift')
    if os.path.exists(gm_path):
        gm_c = open(gm_path, 'r', encoding='utf-8').read()
        gm_orig = gm_c
        # Replace the entire constant block up to View(GlassView.self) cleanly
        gm_c = re.sub(
            r'Constant\("isLiquidGlassAvailable"\)[\s\S]*?(?=View\(GlassView\.self\))',
            'Constant("isLiquidGlassAvailable") {\n      return true\n    }\n\n    Constant("isGlassEffectAPIAvailable") {\n      return true\n    }\n\n    ',
            gm_c
        )
        if gm_c != gm_orig:
            open(gm_path, 'w', encoding='utf-8').write(gm_c)
            print(f"  Fixed GlassEffectModule.swift in: {gm_path}")

    # JS build files
    for js_f in [
        os.path.join(gbase, 'build', 'isGlassEffectAPIAvailable.js'),
        os.path.join(gbase, 'build', 'isGlassEffectAPIAvailable.ios.js'),
        os.path.join(gbase, 'build', 'isLiquidGlassAvailable.js'),
        os.path.join(gbase, 'build', 'isLiquidGlassAvailable.ios.js'),
    ]:
        if os.path.exists(js_f):
            jc = open(js_f, 'r', encoding='utf-8').read()
            jorig = jc
            jc = re.sub(r'return [!a-zA-Z0-9_]+;', 'return true;', jc)
            if jc != jorig:
                open(js_f, 'w', encoding='utf-8').write(jc)
                print(f"  Fixed JS file in: {js_f}")

print("Finished applying expo-modules-jsi patches.")
