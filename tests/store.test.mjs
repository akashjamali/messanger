import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual Zustand stores. Only the native MMKV boundary and bitmap
// loader are replaced; reducers and persistence middleware run unchanged.
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
const disks = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const require = createRequire(file);
  const localRequire = (id) => {
    if (id === "react-native-mmkv")
      return {
        createMMKV: ({ id }) => {
          if (!disks.has(id)) disks.set(id, new Map());
          const disk = disks.get(id);
          return {
            getString: (key) => disk.get(key),
            set: (key, value) => disk.set(key, value),
            remove: (key) => disk.delete(key),
          };
        },
      };
    if (id.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), id);
      if (/\.(png|jpe?g)$/.test(resolved)) return resolved;
      const source = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find(
        existsSync,
      );
      if (source) return load(source);
    }
    return require(id);
  };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: file,
  })(localRequire, module, module.exports);
  return module.exports;
}
const { useFable: fable } = load(
  path.join(root, "src/cookbooks/fable/data/store.ts"),
);
const { registerPerson } = load(
  path.join(root, "src/cookbooks/fable/data/people.ts"),
);
registerPerson({ id: "mara", name: "Mara", first: "Mara" });

test("Fable: blank and unknown-recipient submissions do not create threads", () => {
  fable.getState().reset();
  fable.getState().append("mara", "   ");
  for (const invalid of [
    "missing-person",
    "constructor",
    "__proto__",
    "toString",
  ])
    fable.getState().append(invalid, "Hello");
  assert.deepEqual(fable.getState().threads, {});
});
test("Fable: two submissions in one millisecond have distinct IDs and retain the sample history", () => {
  fable.getState().reset();
  const clock = Date.now;
  Date.now = () => 12345;
  try {
    fable.getState().append("mara", "First");
    fable.getState().append("mara", "Second");
  } finally {
    Date.now = clock;
  }
  const messages = fable.getState().threads.mara;
  assert.ok(messages.length >= 2);
  assert.equal(messages.at(-2).text, "First");
  assert.equal(messages.at(-1).text, "Second");
  assert.notEqual(messages.at(-2).id, messages.at(-1).id);
});
test("Fable: reading twice is idempotent and reset preserves appearance", () => {
  fable.getState().markRead("mara");
  const read = fable.getState().read;
  fable.getState().markRead("mara");
  assert.equal(fable.getState().read, read);
  fable.getState().setTheme("dark");
  fable.getState().reset();
  assert.deepEqual(fable.getState().threads, {});
  assert.deepEqual(fable.getState().read, []);
  assert.equal(fable.getState().theme, "dark");
});
test("Cookbook persistence survives store hydration", async () => {
  fable.getState().append("mara", "Fable only");
  const fableDisk = disks.get("fable-local-v1").get("fable-state");
  assert.ok(fableDisk.includes("Fable only"));
  await fable.persist.rehydrate();
  assert.equal(fable.getState().threads.mara.at(-1).text, "Fable only");
});
