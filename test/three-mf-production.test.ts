/**
 * 3MF production-extension flattening.
 *
 * Bambu/Orca/Prusa exports keep their mesh in a separate model part that the
 * root references with `p:path`. ThreeMFLoader ignores that attribute, so
 * every such file was rejected with "Could not read that file. Try
 * re-exporting it from your CAD app." — on files that are perfectly valid
 * and which our own server-side trimesh reads without complaint.
 *
 * The DOM rewrite itself needs DOMParser/XMLSerializer and is verified in a
 * real browser. What is covered here is the part that must never go wrong:
 * a file we don't need to touch must come back byte-identical, because a
 * best-effort rewrite that corrupts ordinary uploads would be far worse than
 * the bug it fixes.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { zipSync, strToU8 } from "fflate";

import {
  usesProductionExtension,
  rootModelName,
  flattenProductionExtension,
} from "@/lib/three-mf-production";

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

/** An ordinary single-part 3MF: mesh lives in the root model. */
function plainModel(): Record<string, Uint8Array> {
  return {
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(`<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model"><mesh>
   <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
   <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object>
 </resources>
 <build><item objectid="1"/></build>
</model>`),
  };
}

/** The Bambu shape: root is a container, geometry is in another part. */
function productionModel(): Record<string, Uint8Array> {
  return {
    "_rels/.rels": strToU8(RELS),
    "3D/_rels/3dmodel.model.rels": strToU8(`<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_13.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`),
    "3D/3dmodel.model": strToU8(`<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
 <resources>
  <object id="2" type="model">
   <components>
    <component p:path="/3D/Objects/object_13.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>
 </resources>
 <build><item objectid="2"/></build>
</model>`),
    "3D/Objects/object_13.model": strToU8(`<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model"><mesh>
   <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
   <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object>
 </resources>
</model>`),
  };
}

const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

describe("detecting the production extension", () => {
  it("flags a file whose components point at another model part", () => {
    assert.equal(usesProductionExtension(productionModel()), true);
  });

  it("does not flag an ordinary single-part 3MF", () => {
    assert.equal(usesProductionExtension(plainModel()), false);
  });

  it("is not fooled by the word 'path' elsewhere in the document", () => {
    const zip = plainModel();
    zip["3D/3dmodel.model"] = strToU8(
      `<model><metadata name="pathname">/some/path</metadata><resources/></model>`,
    );
    assert.equal(usesProductionExtension(zip), false);
  });

  it("ignores non-model entries such as thumbnails and settings", () => {
    const zip = plainModel();
    zip["Metadata/project_settings.config"] = strToU8('{"path":"/3D/Objects/x.model"}');
    zip["Auxiliaries/.thumbnails/thumb.png"] = strToU8("not xml");
    assert.equal(usesProductionExtension(zip), false);
  });
});

describe("resolving the root model part", () => {
  it("follows the package relationships", () => {
    assert.equal(rootModelName(productionModel()), "3D/3dmodel.model");
  });

  it("falls back to the conventional path when rels are missing", () => {
    const zip = plainModel();
    delete zip["_rels/.rels"];
    assert.equal(rootModelName(zip), "3D/3dmodel.model");
  });

  it("returns null when there is no model part at all", () => {
    assert.equal(rootModelName({ "Metadata/x.config": strToU8("{}") }), null);
  });
});

describe("leaving files alone when it should", () => {
  // The whole risk of this rewrite is breaking uploads that already worked.
  it("returns an ordinary 3MF byte-identical", () => {
    const original = toArrayBuffer(zipSync(plainModel()));
    const out = flattenProductionExtension(original);
    assert.equal(out, original, "should be the very same buffer, not a copy");
  });

  it("returns non-zip data untouched rather than throwing", () => {
    const garbage = toArrayBuffer(strToU8("this is not a zip file at all"));
    assert.equal(flattenProductionExtension(garbage), garbage);
  });

  it("returns an empty buffer untouched", () => {
    const empty = new ArrayBuffer(0);
    assert.equal(flattenProductionExtension(empty), empty);
  });

  it("does not touch a production file that has no resolvable root", () => {
    const zip = productionModel();
    delete zip["3D/3dmodel.model"];
    delete zip["_rels/.rels"];
    const original = toArrayBuffer(zipSync(zip));
    assert.equal(flattenProductionExtension(original), original);
  });
});
