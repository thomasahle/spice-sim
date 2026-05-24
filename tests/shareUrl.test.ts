import assert from "node:assert/strict";
import test from "node:test";

import { emptyDoc } from "../src/editor/model.ts";
import { decodeSharedDoc, encodeSharedDoc, sharedDocFromHash, shareUrlForDoc } from "../src/editor/shareUrl.ts";

test("share URLs round-trip the circuit document", () => {
  const encoded = encodeSharedDoc(emptyDoc);
  assert.deepEqual(decodeSharedDoc(encoded), emptyDoc);
});

test("share URLs preserve existing hash params and replace doc", () => {
  const url = shareUrlForDoc("http://localhost:5174/#view=schematic&doc=old", emptyDoc);

  assert.equal(new URL(url).hash.includes("view=schematic"), true);
  assert.deepEqual(sharedDocFromHash(new URL(url).hash), emptyDoc);
});

test("invalid share payloads are ignored", () => {
  assert.equal(sharedDocFromHash("#doc=not-valid-base64"), null);
  assert.equal(sharedDocFromHash("#view=schematic"), null);
});
