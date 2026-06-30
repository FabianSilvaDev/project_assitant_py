import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GraphData, GraphNode } from './types';

interface GraphSceneProps {
  data: GraphData;
  selectedNode: GraphNode | null;
  onNodeClick: (node: GraphNode) => void;
  thinking?: boolean;
}

function hexToColor(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

function CameraAnimator({ target }: { target: [number, number, number] | null }) {
  const dest = useRef<THREE.Vector3 | null>(null);
  useFrame(({ camera }) => {
    if (!target) return;
    if (!dest.current) dest.current = new THREE.Vector3();
    dest.current.set(target[0], target[1], target[2] + 180);
    camera.position.lerp(dest.current, 0.04);
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

// Pulso global de luz que viaja por todas las aristas mientras thinking=true
function NeuralPulse({ nodes, edges, active }: { nodes: GraphNode[]; edges: GraphData['edges']; active: boolean }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const segmentCount = Math.max(edges.length, 1);

  // Cada arista se divide en pequeños segmentos para el shader de pulso
  const pulseGeo = useMemo(() => {
    const positions: number[] = [];
    const directions: number[] = []; // 0 = source->target, 1 = target->source
    const seeds: number[] = [];

    edges.forEach((e, i) => {
      const s = nodes[e.source];
      const t = nodes[e.target];
      if (!s || !t) return;
      const steps = 20;
      for (let k = 0; k <= steps; k++) {
        const alpha = k / steps;
        positions.push(
          s.x + (t.x - s.x) * alpha,
          s.y + (t.y - s.y) * alpha,
          s.z + (t.z - s.z) * alpha
        );
        directions.push(alpha);
        seeds.push(i * 0.73);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aDirection', new THREE.Float32BufferAttribute(directions, 1));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    return geometry;
  }, [nodes, edges]);

  // Partículas que se desplazan físicamente por aristas
  const particleCount = Math.min(segmentCount * 3, 120);
  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const progress = new Float32Array(particleCount);
    const edgeIndex = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      edgeIndex[i] = Math.floor(Math.random() * segmentCount);
      progress[i] = Math.random();
      speeds[i] = 0.2 + Math.random() * 0.4;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    return { positions, progress, edgeIndex, speeds };
  }, [segmentCount]);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
      materialRef.current.uniforms.uActive.value = active ? 1.0 : 0.0;
    }

    if (!particlesRef.current || !active) return;
    const posAttr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      particles.progress[i] += particles.speeds[i] * 0.016;
      if (particles.progress[i] >= 1) {
        particles.progress[i] = 0;
        particles.edgeIndex[i] = Math.floor(Math.random() * segmentCount);
      }

      const eIdx = Math.floor(particles.edgeIndex[i]);
      const e = edges[eIdx];
      const s = e ? nodes[e.source] : null;
      const t = e ? nodes[e.target] : null;
      if (s && t) {
        const p = particles.progress[i];
        posArr[i * 3] = s.x + (t.x - s.x) * p;
        posArr[i * 3 + 1] = s.y + (t.y - s.y) * p;
        posArr[i * 3 + 2] = s.z + (t.z - s.z) * p;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <group>
      {/* Pulso de luz sobre aristas */}
      <points geometry={pulseGeo}>
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uActive: { value: 0 },
            uColor: { value: new THREE.Color(0x38bdf8) },
          }}
          vertexShader={`
            attribute float aDirection;
            attribute float aSeed;
            uniform float uTime;
            varying float vAlpha;

            void main() {
              float speed = 1.8 + fract(aSeed) * 0.7;
              float wave = fract(aDirection - uTime * speed + aSeed);
              float glow = exp(-wave * wave * 18.0);
              vAlpha = glow;

              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = 4.0 + glow * 10.0;
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            uniform float uActive;
            varying float vAlpha;
            void main() {
              vec2 coord = gl_PointCoord - vec2(0.5);
              float dist = length(coord);
              if (dist > 0.5) discard;
              float a = (1.0 - smoothstep(0.0, 0.5, dist)) * vAlpha * uActive;
              gl_FragColor = vec4(uColor, a);
            }
          `}
        />
      </points>

      {/* Partículas viajeras */}
      <points ref={particlesRef} visible={active}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uColor: { value: new THREE.Color(0xa5f3fc) },
          }}
          vertexShader={`
            uniform vec3 uColor;
            void main() {
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = 6.0 * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            uniform vec3 uColor;
            void main() {
              vec2 coord = gl_PointCoord - vec2(0.5);
              float dist = length(coord);
              if (dist > 0.5) discard;
              float glow = 1.0 - smoothstep(0.0, 0.35, dist);
              gl_FragColor = vec4(uColor, glow);
            }
          `}
        />
      </points>
    </group>
  );
}

function NodesAndEdges({
  nodes,
  edges,
  onNodeClick,
  selectedId,
  pulseActive,
}: {
  nodes: GraphNode[];
  edges: GraphData['edges'];
  onNodeClick: (node: GraphNode) => void;
  selectedId: number | null;
  pulseActive: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(nodes.length * 3);
    const col = new Float32Array(nodes.length * 3);
    const sz = new Float32Array(nodes.length);
    nodes.forEach((n, i) => {
      pos[i * 3] = n.x;
      pos[i * 3 + 1] = n.y;
      pos[i * 3 + 2] = n.z;
      const c = hexToColor(n.color);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      sz[i] = n.size;
    });
    return { positions: pos, colors: col, sizes: sz };
  }, [nodes]);

  const lineGeo = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    edges.forEach((e) => {
      const s = nodes[e.source];
      const t = nodes[e.target];
      if (!s || !t) return;
      pos.push(s.x, s.y, s.z, t.x, t.y, t.z);
      col.push(0.35, 0.45, 0.65, 0.35, 0.45, 0.65);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geometry;
  }, [nodes, edges]);

  // Animación de pulso en nodos cuando thinking
  const pulseRef = useRef({ phase: 0 });
  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const attr = pointsRef.current.geometry.attributes.size as THREE.BufferAttribute;
    pulseRef.current.phase += delta * 3;
    for (let i = 0; i < nodes.length; i++) {
      const base = nodes[i].size;
      const isSelected = i === selectedId;
      const pulse = pulseActive ? Math.sin(pulseRef.current.phase + i) * 0.25 + 1 : 1;
      attr.setX(i, base * (isSelected ? 2.4 : pulse));
    }
    attr.needsUpdate = true;
  });

  const handlePointer = (e: any, isClick: boolean) => {
    e.stopPropagation();
    pointer.x = (e.clientX / size.width) * 2 - 1;
    pointer.y = -(e.clientY / size.height) * 2 + 1;
    raycaster.params.Points!.threshold = 12;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(pointsRef.current!);
    if (hits.length > 0 && hits[0].index !== undefined) {
      const idx = hits[0].index!;
      if (isClick) onNodeClick(nodes[idx]);
    }
  };

  return (
    <group
      onPointerMove={(e) => handlePointer(e, false)}
      onClick={(e) => handlePointer(e, true)}
    >
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial vertexColors transparent opacity={0.18} />
      </lineSegments>

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
          <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexColors
          uniforms={{
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          }}
          vertexShader={`
            attribute float size;
            varying vec3 vColor;
            uniform float uPixelRatio;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            varying vec3 vColor;
            void main() {
              vec2 coord = gl_PointCoord - vec2(0.5);
              float dist = length(coord);
              if (dist > 0.5) discard;
              float glow = 1.0 - smoothstep(0.25, 0.5, dist);
              gl_FragColor = vec4(vColor, 1.0) * glow;
            }
          `}
        />
      </points>

      <NeuralPulse nodes={nodes} edges={edges} active={pulseActive} />
    </group>
  );
}

export default function GraphScene({ data, selectedNode, onNodeClick, thinking = false }: GraphSceneProps) {
  const target = useMemo(() => {
    if (!selectedNode) return null;
    return [selectedNode.x, selectedNode.y, selectedNode.z] as [number, number, number];
  }, [selectedNode]);

  return (
    <Canvas
      camera={{ position: [0, 0, 350], fov: 55, near: 0.1, far: 5000 }}
      style={{ background: '#06090f' }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#06090f']} />

      <NodesAndEdges
        nodes={data.nodes}
        edges={data.edges}
        onNodeClick={onNodeClick}
        selectedId={selectedNode?.id ?? null}
        pulseActive={thinking}
      />

      {target && <CameraAnimator target={target} />}

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.75}
          intensity={1.6}
          mipmapBlur
          radius={0.6}
        />
      </EffectComposer>

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={1.2}
        minDistance={80}
        maxDistance={2500}
        autoRotate
        autoRotateSpeed={0.12}
      />
    </Canvas>
  );
}
