declare module "occt-import-js" {
  export type OcctMesh = {
    name?: string;
    color?: number[] | null;
    attributes: {
      position: { array: number[] | Float32Array };
      normal?: { array: number[] | Float32Array };
    };
    index?: { array: number[] | Uint32Array };
  };
  export type OcctResult = { success: boolean; meshes: OcctMesh[] };
  export type OcctModule = {
    ReadStepFile: (data: Uint8Array, params: unknown) => OcctResult;
    ReadBrepFile: (data: Uint8Array, params: unknown) => OcctResult;
    ReadIgesFile: (data: Uint8Array, params: unknown) => OcctResult;
  };
  const occtFactory: (config?: {
    locateFile?: (path: string) => string;
  }) => Promise<OcctModule>;
  export default occtFactory;
}
