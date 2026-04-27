"use client";
import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Grid,
  OrbitControls,
  useBounds,
} from "@react-three/drei";
import * as THREE from "three";

export type ViewerHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

export type ViewerPart = {
  geometry: THREE.BufferGeometry;
  color: string;
  /** Stable id used as React key — typically the part's geometry uuid. */
  id?: string;
};

type Props = {
  parts: ViewerPart[];
  /** Imperative handle the parent uses to drive the on-screen zoom buttons. */
  controlRef?: React.MutableRefObject<ViewerHandle | null>;
};

/**
 * Zooms the perspective camera by scaling its offset from the orbit target.
 * Factor < 1 zooms in (camera moves toward target), > 1 zooms out.
 */
function dollyCamera(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  factor: number,
  minDistance = 40,
  maxDistance = 400,
) {
  const offset = camera.position.clone().sub(target);
  const next = offset.length() * factor;
  const clamped = Math.max(minDistance, Math.min(maxDistance, next));
  offset.setLength(clamped);
  camera.position.copy(target).add(offset);
  camera.updateProjectionMatrix();
}

/**
 * Bridges drei's `useBounds()` (only available inside <Bounds>) and the
 * R3F camera/controls into the imperative handle the parent <ViewerShell>
 * holds. Lives inside <Bounds> so `fit()` can re-frame the model.
 */
function ControlBridge({
  controlRef,
}: {
  controlRef?: React.MutableRefObject<ViewerHandle | null>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & {
        target: THREE.Vector3;
        update: () => void;
        minDistance?: number;
        maxDistance?: number;
      })
    | null;
  const bounds = useBounds();

  React.useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      zoomIn: () => {
        if (!controls) return;
        dollyCamera(
          camera as THREE.PerspectiveCamera,
          controls.target,
          0.82,
          controls.minDistance ?? 40,
          controls.maxDistance ?? 320,
        );
        controls.update();
      },
      zoomOut: () => {
        if (!controls) return;
        dollyCamera(
          camera as THREE.PerspectiveCamera,
          controls.target,
          1 / 0.82,
          controls.minDistance ?? 40,
          controls.maxDistance ?? 320,
        );
        controls.update();
      },
      fit: () => {
        bounds.refresh().clip().fit();
      },
    };
    return () => {
      if (controlRef.current) controlRef.current = null;
    };
  }, [camera, controls, bounds, controlRef]);
  return null;
}

export function Viewer({ parts, controlRef }: Props) {
  const [contextLost, setContextLost] = React.useState(false);

  if (contextLost) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
          GPU dropped the preview
        </div>
        <p className="text-[12px] font-light text-black/60 max-w-md leading-relaxed">
          Your browser ran low on graphics memory. Quote and order flow are
          unaffected.
        </p>
        <button
          onClick={() => setContextLost(false)}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] hover:underline"
        >
          Retry preview
        </button>
      </div>
    );
  }

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [90, 80, 120], fov: 32 }}
      gl={{
        antialias: true,
        powerPreference: "default",
      }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener(
          "webglcontextlost",
          (e) => {
            e.preventDefault();
            console.warn("[viewer] WebGL context lost");
            setContextLost(true);
          },
          { passive: false },
        );
        canvas.addEventListener("webglcontextrestored", () => {
          console.info("[viewer] WebGL context restored");
          setContextLost(false);
        });
      }}
    >
      <color attach="background" args={["#ffffff"]} />
      {/* Fog is white (matches background) and acts as a depth fade. Pushed
          to start well beyond maxDistance so the model never fades into the
          background at any reachable zoom. */}
      <fog attach="fog" args={["#ffffff", 600, 1500]} />

      <ambientLight intensity={0.7} />
      <directionalLight
        castShadow
        position={[40, 80, 30]}
        intensity={1.0}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <directionalLight position={[-30, 20, -30]} intensity={0.35} />

      <Bounds fit clip observe margin={1.4}>
        <Center>
          {/* One <mesh> per part. Keyed on geometry uuid so swapping files
              cleanly remounts and we never hand a disposed buffer to a live
              mesh. Each part gets its own material instance for per-part
              colour control. */}
          {parts.map((part) => (
            <mesh
              key={part.id ?? part.geometry.uuid}
              geometry={part.geometry}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color={part.color}
                roughness={0.55}
                metalness={0.04}
                flatShading={false}
              />
            </mesh>
          ))}
        </Center>
        <ControlBridge controlRef={controlRef} />
      </Bounds>

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.3}
        scale={300}
        blur={2}
        far={60}
      />
      <Grid
        position={[0, 0, 0]}
        args={[400, 400]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#d4d4d4"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#a3a3a3"
        fadeDistance={260}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.7}
        minDistance={40}
        // Tighter cap than the fog start (600). Even at max zoom-out the
        // model stays in the un-fogged region.
        maxDistance={320}
      />
    </Canvas>
  );
}
