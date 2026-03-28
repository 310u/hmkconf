import ts from "typescript"

const NEGATIVE_NUMERIC_LITERAL_ASSERT =
  "Negative numbers should be created in combination with createPrefixUnaryExpression"

const originalAssert = ts.Debug?.assert?.bind(ts.Debug)

if (originalAssert) {
  ts.Debug.assert = (condition, message, ...rest) => {
    if (!condition && message === NEGATIVE_NUMERIC_LITERAL_ASSERT) {
      return
    }

    return originalAssert(condition, message, ...rest)
  }
}

await import("../node_modules/svelte-check/bin/svelte-check")
