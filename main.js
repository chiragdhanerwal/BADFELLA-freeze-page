import * as THREE from 'three';

// --- SHADERS ---

// A simple vertex shader that just passes UVs and positions
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A fragment shader for the interactive leopard texture
const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uHoverState;
  uniform float uImageAspect;
  uniform float uZoom;
  uniform float uRadius;
  
  varying vec2 vUv;

  void main() {
    // Center the screen UV
    vec2 screenUv = vUv - 0.5;
    
    // Screen aspect ratio
    float screenAspect = uResolution.x / uResolution.y;
    
    // Rotated Image aspect ratio (original height / width)
    // Avoid division by zero
    float imgAspect = uImageAspect == 0.0 ? 1.0 : uImageAspect;
    float rotImageAspect = 1.0 / imgAspect; 
    
    // background-size: cover logic BEFORE rotating
    vec2 scale = vec2(1.0);
    if (screenAspect > rotImageAspect) {
        // Screen is wider relative to image: fit width, crop height
        scale.y = rotImageAspect / screenAspect;
    } else {
        // Screen is taller relative to image: fit height, crop width
        scale.x = screenAspect / rotImageAspect;
    }
    screenUv *= scale;
    
    // Rotate 90 degrees (Portrait to Landscape)
    vec2 uv = vec2(screenUv.y, -screenUv.x);
    
    // Shift back to 0-1
    uv += 0.5;
    
    vec2 st = gl_FragCoord.xy / uResolution.xy;
    float aspect = uResolution.x / uResolution.y;
    
    vec2 stAspect = st;
    stAspect.x *= aspect;
    vec2 mouseAspect = uMouse;
    mouseAspect.x *= aspect;
    
    float dist = distance(stAspect, mouseAspect);
    
    // Responsive radius for tighter focus on desktop, larger on mobile
    float radius = uRadius; 
    float influence = (1.0 - smoothstep(0.0, radius, dist)) * uHoverState;
    // Smoother falloff for a broad, gentle fade
    float powerInfluence = pow(influence, 1.4); 
    
    // Sample texture directly with no dilation/expansion
    vec3 texColor = texture2D(tDiffuse, uv).rgb;
    
    // Keep the texture intrinsically bright
    texColor *= 1.1; 
    float lum = dot(texColor, vec3(0.299, 0.587, 0.114));
    float purpleMask = smoothstep(0.01, 0.5, lum); 
    
    // Extremely subtle neon glow
    texColor.r += 0.05 * purpleMask * influence; 
    texColor.b += 0.1 * purpleMask * influence;
    
    // Base is premium white canvas
    vec3 baseWhite = vec3(0.96, 0.96, 0.96);
    
    // Reveal the texture depending on mouse influence
    // Multiplying the influence by just 0.35 keeps the texture faint, ghostly, and very light
    vec3 finalColor = mix(baseWhite, texColor, powerInfluence * 0.35);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// --- THREE.JS SETUP ---

// Main elements
const container = document.getElementById('canvas-container');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // optimize for high DPI but limit to 2 for perf
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();
// We use an orthographic camera so the plane perfectly fills the screen without perspective distortion
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Texture loader
const textureLoader = new THREE.TextureLoader();
let leopardTexture = textureLoader.load('/texute.webp', (tex) => {
  // Config texture wrapper
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (tex.image && tex.image.height) {
    uniforms.uImageAspect.value = tex.image.width / tex.image.height;
  }
});

// Uniforms for the shader
const uniforms = {
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  tDiffuse: { value: leopardTexture },
  uHoverState: { value: 0.0 },
  uImageAspect: { value: 1.0 },
  uZoom: { value: 1.8 }, // Adjusted for a nice organic pattern scale
  uRadius: { value: window.innerWidth < 768 ? 1.8 : 0.8 } // Larger on mobile
};

// Material
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  depthWrite: false,
  depthTest: false
});

// Geometry: a simple plane that covers the entire orthographic bounds
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --- INTERACTIVITY ---

// Target coordinates for wandering
const targetMouse = new THREE.Vector2(0.5, 0.5);
const currentMouse = new THREE.Vector2(0.5, 0.5);
let currentHoverState = 0.0;

// Handle resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  uniforms.uRadius.value = window.innerWidth < 768 ? 1.8 : 0.8;
});

// --- ANIMATION LOOP ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Permanent autonomous organic wandering 
  // Smooth Lissajous curve creating a slow roaming effect
  targetMouse.x = 0.5 + Math.sin(elapsed * 0.35) * Math.cos(elapsed * 0.22) * 0.45;
  targetMouse.y = 0.5 + Math.sin(elapsed * 0.45) * Math.cos(elapsed * 0.17) * 0.45;

  // Smoothly interpolate current mouse to target mouse for organic drifting
  currentMouse.x += (targetMouse.x - currentMouse.x) * 0.02;
  currentMouse.y += (targetMouse.y - currentMouse.y) * 0.02;

  // Keep the reveal effect consistently large and visible
  currentHoverState += (1.0 - currentHoverState) * 0.05;

  // Update uniforms
  uniforms.uMouse.value.copy(currentMouse);
  uniforms.uHoverState.value = currentHoverState;

  renderer.render(scene, camera);
}

// Start
animate();
