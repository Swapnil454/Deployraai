"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface NetworkNode {
  id: string;
  name: string;
  city: string;
  country: string;
  part: number; // 1 to 7
  lat: number;
  lng: number;
  ping: number;
  color: string;
}

// 42 locations divided into 7 continuous regional parts (6 hubs per part)
const NETWORK_NODES: NetworkNode[] = [
  // ── PART 1: NORTH AMERICA EAST & CENTRAL (6 Hubs) ──
  { id: "jfk", name: "JFK", city: "New York", country: "USA", part: 1, lat: 40.7128, lng: -74.006, ping: 18, color: "#38bdf8" },
  { id: "bos", name: "BOS", city: "Boston", country: "USA", part: 1, lat: 42.3601, lng: -71.0589, ping: 19, color: "#38bdf8" },
  { id: "yul", name: "YUL", city: "Montreal", country: "Canada", part: 1, lat: 45.5017, lng: -73.5673, ping: 22, color: "#38bdf8" },
  { id: "yyz", name: "YYZ", city: "Toronto", country: "Canada", part: 1, lat: 43.6532, lng: -79.3832, ping: 21, color: "#38bdf8" },
  { id: "ord", name: "ORD", city: "Chicago", country: "USA", part: 1, lat: 41.8781, lng: -87.6298, ping: 20, color: "#38bdf8" },
  { id: "atl", name: "ATL", city: "Atlanta", country: "USA", part: 1, lat: 33.749, lng: -84.388, ping: 22, color: "#38bdf8" },

  // ── PART 2: NORTH AMERICA WEST & PACIFIC (6 Hubs) ──
  { id: "sea", name: "SEA", city: "Seattle", country: "USA", part: 2, lat: 47.6062, lng: -122.3321, ping: 23, color: "#0ea5e9" },
  { id: "yvr", name: "YVR", city: "Vancouver", country: "Canada", part: 2, lat: 49.2827, lng: -123.1207, ping: 25, color: "#0ea5e9" },
  { id: "sfo", name: "SFO", city: "San Francisco", country: "USA", part: 2, lat: 37.7749, lng: -122.4194, ping: 24, color: "#0ea5e9" },
  { id: "lax", name: "LAX", city: "Los Angeles", country: "USA", part: 2, lat: 34.0522, lng: -118.2437, ping: 22, color: "#0ea5e9" },
  { id: "phx", name: "PHX", city: "Phoenix", country: "USA", part: 2, lat: 33.4484, lng: -112.074, ping: 26, color: "#0ea5e9" },
  { id: "dfw", name: "DFW", city: "Dallas", country: "USA", part: 2, lat: 32.7767, lng: -96.797, ping: 20, color: "#0ea5e9" },

  // ── PART 3: CENTRAL & SOUTH AMERICA (6 Hubs) ──
  { id: "mex", name: "MEX", city: "Mexico City", country: "Mexico", part: 3, lat: 19.4326, lng: -99.1332, ping: 42, color: "#10b981" },
  { id: "bog", name: "BOG", city: "Bogotá", country: "Colombia", part: 3, lat: 4.711, lng: -74.0721, ping: 52, color: "#10b981" },
  { id: "lim", name: "LIM", city: "Lima", country: "Peru", part: 3, lat: -12.0464, lng: -77.0428, ping: 58, color: "#10b981" },
  { id: "scl", name: "SCL", city: "Santiago", country: "Chile", part: 3, lat: -33.4489, lng: -70.6693, ping: 68, color: "#10b981" },
  { id: "eze", name: "EZE", city: "Buenos Aires", country: "Argentina", part: 3, lat: -34.6037, lng: -58.3816, ping: 64, color: "#10b981" },
  { id: "gru", name: "GRU", city: "São Paulo", country: "Brazil", part: 3, lat: -23.5505, lng: -46.6333, ping: 60, color: "#10b981" },

  // ── PART 4: WESTERN & NORTHERN EUROPE (6 Hubs) ──
  { id: "lhr", name: "LHR", city: "London", country: "UK", part: 4, lat: 51.5074, lng: -0.1278, ping: 11, color: "#22c55e" },
  { id: "dub", name: "DUB", city: "Dublin", country: "Ireland", part: 4, lat: 53.3498, lng: -6.2603, ping: 13, color: "#22c55e" },
  { id: "ams", name: "AMS", city: "Amsterdam", country: "Netherlands", part: 4, lat: 52.3676, lng: 4.9041, ping: 12, color: "#22c55e" },
  { id: "fra", name: "FRA", city: "Frankfurt", country: "Germany", part: 4, lat: 50.1109, lng: 8.6821, ping: 12, color: "#22c55e" },
  { id: "cdg", name: "CDG", city: "Paris", country: "France", part: 4, lat: 48.8566, lng: 2.3522, ping: 13, color: "#22c55e" },
  { id: "arn", name: "ARN", city: "Stockholm", country: "Sweden", part: 4, lat: 59.3293, lng: 18.0686, ping: 18, color: "#22c55e" },

  // ── PART 5: SOUTHERN EUROPE & MIDDLE EAST (6 Hubs) ──
  { id: "mad", name: "MAD", city: "Madrid", country: "Spain", part: 5, lat: 40.4168, lng: -3.7038, ping: 16, color: "#eab308" },
  { id: "mxp", name: "MXP", city: "Milan", country: "Italy", part: 5, lat: 45.4642, lng: 9.19, ping: 15, color: "#eab308" },
  { id: "ath", name: "ATH", city: "Athens", country: "Greece", part: 5, lat: 37.9838, lng: 23.7275, ping: 22, color: "#eab308" },
  { id: "tlv", name: "TLV", city: "Tel Aviv", country: "Israel", part: 5, lat: 32.0853, lng: 34.7818, ping: 26, color: "#eab308" },
  { id: "ruh", name: "RUH", city: "Riyadh", country: "Saudi Arabia", part: 5, lat: 24.7136, lng: 46.6753, ping: 32, color: "#eab308" },
  { id: "dxb", name: "DXB", city: "Dubai", country: "UAE", part: 5, lat: 25.2048, lng: 55.2708, ping: 28, color: "#eab308" },

  // ── PART 6: SOUTH & EAST ASIA (6 Hubs) ──
  { id: "bom", name: "BOM", city: "Mumbai", country: "India", part: 6, lat: 19.076, lng: 72.8777, ping: 15, color: "#f97316" },
  { id: "del", name: "DEL", city: "New Delhi", country: "India", part: 6, lat: 28.6139, lng: 77.209, ping: 16, color: "#f97316" },
  { id: "sin", name: "SIN", city: "Singapore", country: "Singapore", part: 6, lat: 1.3521, lng: 103.8198, ping: 20, color: "#f97316" },
  { id: "hkg", name: "HKG", city: "Hong Kong", country: "Hong Kong", part: 6, lat: 22.3193, lng: 114.1694, ping: 24, color: "#f97316" },
  { id: "icn", name: "ICN", city: "Seoul", country: "South Korea", part: 6, lat: 37.5665, lng: 126.978, ping: 29, color: "#f97316" },
  { id: "hnd", name: "HND", city: "Tokyo", country: "Japan", part: 6, lat: 35.6762, lng: 139.6503, ping: 27, color: "#f97316" },

  // ── PART 7: AFRICA & OCEANIA (6 Hubs) ──
  { id: "los", name: "LOS", city: "Lagos", country: "Nigeria", part: 7, lat: 6.5244, lng: 3.3792, ping: 65, color: "#a855f7" },
  { id: "nbo", name: "NBO", city: "Nairobi", country: "Kenya", part: 7, lat: -1.2921, lng: 36.8219, ping: 68, color: "#a855f7" },
  { id: "jnb", name: "JNB", city: "Johannesburg", country: "South Africa", part: 7, lat: -26.2041, lng: 28.0473, ping: 72, color: "#a855f7" },
  { id: "cpt", name: "CPT", city: "Cape Town", country: "South Africa", part: 7, lat: -33.9249, lng: 18.4241, ping: 74, color: "#a855f7" },
  { id: "per", name: "PER", city: "Perth", country: "Australia", part: 7, lat: -31.9505, lng: 115.8605, ping: 50, color: "#a855f7" },
  { id: "syd", name: "SYD", city: "Sydney", country: "Australia", part: 7, lat: -33.8688, lng: 151.2093, ping: 44, color: "#a855f7" },
];

// Continuous regional circuits for all 7 parts + Inter-part bridges
const CONNECTIONS: { from: number; to: number; type: "intra" | "inter" }[] = [
  // ── Continuous Part 1 Circuit (NA East) ──
  { from: 0, to: 1, type: "intra" },
  { from: 1, to: 2, type: "intra" },
  { from: 2, to: 3, type: "intra" },
  { from: 3, to: 4, type: "intra" },
  { from: 4, to: 5, type: "intra" },
  { from: 5, to: 0, type: "intra" },

  // ── Continuous Part 2 Circuit (NA West) ──
  { from: 6, to: 7, type: "intra" },
  { from: 7, to: 8, type: "intra" },
  { from: 8, to: 9, type: "intra" },
  { from: 9, to: 10, type: "intra" },
  { from: 10, to: 11, type: "intra" },
  { from: 11, to: 6, type: "intra" },

  // ── Continuous Part 3 Circuit (Central & South America) ──
  { from: 12, to: 13, type: "intra" },
  { from: 13, to: 14, type: "intra" },
  { from: 14, to: 15, type: "intra" },
  { from: 15, to: 16, type: "intra" },
  { from: 16, to: 17, type: "intra" },
  { from: 17, to: 12, type: "intra" },

  // ── Continuous Part 4 Circuit (Western & Northern Europe) ──
  { from: 18, to: 19, type: "intra" },
  { from: 19, to: 20, type: "intra" },
  { from: 20, to: 21, type: "intra" },
  { from: 21, to: 22, type: "intra" },
  { from: 22, to: 23, type: "intra" },
  { from: 23, to: 18, type: "intra" },

  // ── Continuous Part 5 Circuit (Southern Europe & Middle East) ──
  { from: 24, to: 25, type: "intra" },
  { from: 25, to: 26, type: "intra" },
  { from: 26, to: 27, type: "intra" },
  { from: 27, to: 28, type: "intra" },
  { from: 28, to: 29, type: "intra" },
  { from: 29, to: 24, type: "intra" },

  // ── Continuous Part 6 Circuit (South & East Asia) ──
  { from: 30, to: 31, type: "intra" },
  { from: 31, to: 32, type: "intra" },
  { from: 32, to: 33, type: "intra" },
  { from: 33, to: 34, type: "intra" },
  { from: 34, to: 35, type: "intra" },
  { from: 35, to: 30, type: "intra" },

  // ── Continuous Part 7 Circuit (Africa & Oceania) ──
  { from: 36, to: 37, type: "intra" },
  { from: 37, to: 38, type: "intra" },
  { from: 38, to: 39, type: "intra" },
  { from: 39, to: 40, type: "intra" },
  { from: 40, to: 41, type: "intra" },
  { from: 41, to: 36, type: "intra" },

  // ── Inter-Part Continental Express Bridges ──
  { from: 4, to: 11, type: "inter" }, // Part 1 <-> Part 2: Chicago <-> Dallas
  { from: 0, to: 8, type: "inter" }, // Part 1 <-> Part 2: New York <-> SFO
  { from: 0, to: 18, type: "inter" }, // Part 1 <-> Part 4: New York <-> London (Trans-Atlantic)
  { from: 11, to: 12, type: "inter" }, // Part 2 <-> Part 3: Dallas <-> Mexico City
  { from: 8, to: 35, type: "inter" }, // Part 2 <-> Part 6: SFO <-> Tokyo (Trans-Pacific)
  { from: 21, to: 25, type: "inter" }, // Part 4 <-> Part 5: Frankfurt <-> Milan
  { from: 22, to: 24, type: "inter" }, // Part 4 <-> Part 5: Paris <-> Madrid
  { from: 29, to: 30, type: "inter" }, // Part 5 <-> Part 6: Dubai <-> Mumbai
  { from: 28, to: 37, type: "inter" }, // Part 5 <-> Part 7: Riyadh <-> Nairobi
  { from: 32, to: 40, type: "inter" }, // Part 6 <-> Part 7: Singapore <-> Perth
  { from: 35, to: 41, type: "inter" }, // Part 6 <-> Part 7: Tokyo <-> Sydney
  { from: 17, to: 39, type: "inter" }, // Part 3 <-> Part 7: São Paulo <-> Cape Town (South Atlantic)
];

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export default function GlobeNetworkWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeNode, setActiveNode] = useState<NetworkNode>(NETWORK_NODES[30]); // Default Mumbai

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 155;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5.6);

    // Renderer (100% transparent, crisp pixels)
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Globe Group
    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = 0.22;
    globeGroup.rotation.y = 2.4;
    scene.add(globeGroup);

    const GLOBE_RADIUS = 1.78;

    // Clean authentic Blue Marble & Topology textures
    const textureLoader = new THREE.TextureLoader();
    const earthMap = textureLoader.load("/images/earth-blue-marble.jpg");
    const bumpMap = textureLoader.load("/images/earth-topology.png");
    earthMap.colorSpace = THREE.SRGBColorSpace;

    // Crisp Earth sphere with no haze or blurry outer halo
    const sphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      map: earthMap,
      bumpMap: bumpMap,
      bumpScale: 0.035,
      roughness: 0.72,
      metalness: 0.05,
    });
    const earthMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    globeGroup.add(earthMesh);

    // Crisp Lighting
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(4, 3, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    fillLight.position.set(-4, -1, 3);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0x2a3442, 1.2);
    scene.add(ambientLight);

    // 42 Location Marker Pins with Pulsing Radar Rings
    const rings: { mesh: THREE.Mesh; maxScale: number; speed: number }[] = [];

    NETWORK_NODES.forEach((node) => {
      const pos = latLngToVector3(node.lat, node.lng, GLOBE_RADIUS * 1.002);

      // Core point
      const pinGeo = new THREE.SphereGeometry(0.028, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pos);
      globeGroup.add(pinMesh);

      // Flat Radar Beacon Ring
      const ringGeo = new THREE.RingGeometry(0.034, 0.06, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(node.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(new THREE.Vector3(0, 0, 0));
      globeGroup.add(ringMesh);

      rings.push({
        mesh: ringMesh,
        maxScale: 2.1,
        speed: 0.016 + Math.random() * 0.006,
      });
    });

    // 3D Curved Continuous Arcs & Traveling Photons
    const photons: {
      mesh: THREE.Mesh;
      curve: THREE.QuadraticBezierCurve3;
      progress: number;
      speed: number;
    }[] = [];

    CONNECTIONS.forEach((conn, i) => {
      const p1 = NETWORK_NODES[conn.from];
      const p2 = NETWORK_NODES[conn.to];
      if (!p1 || !p2) return;

      const v1 = latLngToVector3(p1.lat, p1.lng, GLOBE_RADIUS);
      const v2 = latLngToVector3(p2.lat, p2.lng, GLOBE_RADIUS);

      const distance = v1.distanceTo(v2);
      const mid = v1.clone().add(v2).multiplyScalar(0.5);
      const altitude = GLOBE_RADIUS * (1.075 + distance * 0.07);
      mid.normalize().multiplyScalar(altitude);

      const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
      const points = curve.getPoints(32);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);

      const arcColor = conn.type === "inter" ? 0xffffff : new THREE.Color(p1.color);

      const lineMaterial = new THREE.LineBasicMaterial({
        color: arcColor,
        transparent: true,
        opacity: conn.type === "inter" ? 0.6 : 0.45,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      globeGroup.add(line);

      // Traveling data photon
      const photonGeo = new THREE.SphereGeometry(0.026, 8, 8);
      const photonMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
      });
      const photonMesh = new THREE.Mesh(photonGeo, photonMat);
      photonMesh.position.copy(v1);
      globeGroup.add(photonMesh);

      photons.push({
        mesh: photonMesh,
        curve,
        progress: (i * 0.05) % 1.0,
        speed: 0.0045 + (i % 3) * 0.0015,
      });
    });

    // Cycle through locations periodically for the small bottom readout
    let nodeIdx = 30; // Start at Mumbai
    const cycleInterval = setInterval(() => {
      nodeIdx = (nodeIdx + 1) % NETWORK_NODES.length;
      setActiveNode(NETWORK_NODES[nodeIdx]);
    }, 2000);

    // Interactive Drag to Rotate with Smooth Momentum
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let velocityY = 0.0022; // gentle continuous spin
    let velocityX = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      velocityY = dx * 0.0055;
      velocityX = dy * 0.0045;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // Touch Support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevX = e.touches[0].clientX;
        prevY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - prevX;
      const dy = e.touches[0].clientY - prevY;
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;

      velocityY = dx * 0.006;
      velocityX = dy * 0.005;
    };
    const onTouchEnd = () => {
      isDragging = false;
    };
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // Animation Loop
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      globeGroup.rotation.y += velocityY;
      globeGroup.rotation.x += velocityX;

      if (!isDragging) {
        velocityY += (0.0022 - velocityY) * 0.04;
        velocityX += (0 - velocityX) * 0.05;
      }

      globeGroup.rotation.x = Math.max(-0.55, Math.min(0.55, globeGroup.rotation.x));

      // Pulse beacon rings
      rings.forEach((ring) => {
        const s = ring.mesh.scale.x + ring.speed;
        if (s > ring.maxScale) {
          ring.mesh.scale.set(1, 1, 1);
          (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
        } else {
          ring.mesh.scale.set(s, s, s);
          const ratio = (s - 1) / (ring.maxScale - 1);
          (ring.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - ratio));
        }
      });

      // Advance photons
      photons.forEach((p) => {
        p.progress = (p.progress + p.speed) % 1.0;
        const pt = p.curve.getPoint(p.progress);
        p.mesh.position.copy(pt);
      });

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(cycleInterval);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      cancelAnimationFrame(animationFrameId);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      earthMap.dispose();
      bumpMap.dispose();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-[145px] sm:h-[155px] flex items-center justify-center select-none">
      {/* 3D WebGL Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center"
      />

      {/* Small bottom location label shifted slightly more to the right */}
      <div className="absolute bottom-1 right-0 pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#181a20]/80 border border-[#2d323e]/70 backdrop-blur-xs text-[9.5px]">
        <span
          className="w-1.5 h-1.5 rounded-full animate-ping"
          style={{ backgroundColor: activeNode.color }}
        />
        <span className="text-zinc-200 font-medium">{activeNode.city}</span>
        <span
          className="font-mono font-semibold"
          style={{ color: activeNode.color }}
        >
          {activeNode.ping}ms
        </span>
      </div>
    </div>
  );
}
