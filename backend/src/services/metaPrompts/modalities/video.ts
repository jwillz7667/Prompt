/**
 * Video Modality Configuration
 *
 * Optimized for video generation: Sora, Runway Gen-3, Pika, Kling
 * Implements physics-based motion, rigidity cues, and camera vocabulary
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  VideoSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // Cinematic examples
  {
    id: 'video-cinema-1',
    input: 'sunrise timelapse',
    output: `Cinematic timelapse of sunrise over jagged mountain peaks in the Swiss Alps. Camera locked on tripod, static wide shot. Duration: 10 seconds representing 2 hours of real time.

SEQUENCE:
0-3s: Pre-dawn blue hour. Silhouetted mountain ridges against deep indigo sky. Stars gradually fading. Mist settled in valleys below.

3-6s: First golden light crests the eastern peaks. Long dramatic shadows stretch westward across snow-covered slopes. Wispy clouds catch pink and orange hues. Mist begins rising from valleys.

6-10s: Full sunrise. Warm orange and amber light floods the scene. Shadows retreat rapidly. Cloud shadows race across mountain faces. Final frame: fully illuminated alpine landscape with golden highlights on snow.

TECHNICAL: Consistent exposure ramping throughout. Smooth continuous motion of shadows and clouds. Mountains maintain rigid, fixed position. No morphing of rock features. 4K resolution, 24fps output, natural color grading.`,
    subModality: 'timelapse',
    platform: 'general',
    complexity: 'complex',
    tags: ['landscape', 'nature', 'timelapse'],
  },
  {
    id: 'video-cinema-2',
    input: 'car chase scene',
    output: `High-octane car chase through rain-slicked Tokyo streets at night. Duration: 8 seconds.

SCENE: Black Nissan GT-R pursued by two police vehicles through Shibuya district. Neon signs reflecting in puddles. Rain falling at 45-degree angle.

CAMERA: Dynamic tracking shot following the GT-R from rear 3/4 angle, maintaining consistent 10-meter distance. Camera mounted on pursuit vehicle, slight vibration for realism.

MOTION SEQUENCE:
0-2s: GT-R accelerates through intersection, tires spray water, headlights create dramatic flare through rain. Police lights strobe in background.

2-5s: Sharp right turn. GT-R drifts, rear tires breaking traction with visible smoke mixing with rain spray. Police vehicles skid wider. Neon reflections streak across wet asphalt.

5-8s: Straightaway acceleration. Camera pushes in slightly as GT-R gains distance. Brake lights of civilian traffic flash red in the distance.

PHYSICS: Realistic tire spray patterns. Rain maintains consistent fall angle. Vehicle body maintains rigid structure throughout. Accurate motion blur on spinning wheels. Proper lighting interaction with wet surfaces.`,
    subModality: 'cinematic',
    platform: 'sora',
    complexity: 'complex',
    tags: ['action', 'cars', 'night'],
  },
  // Animation examples
  {
    id: 'video-anim-1',
    input: 'cute robot learning to walk',
    output: `Charming 3D animated short: A small spherical robot with single camera eye learns to walk. Pixar-style character design with expressive movements. Duration: 12 seconds.

SETTING: Minimalist white testing facility with soft ambient lighting. Single spotlight on robot. Clean, Apple-aesthetic environment.

CHARACTER: Dome-shaped robot (40cm tall), brushed aluminum body, glowing blue camera eye, two thin articulated legs with round feet.

MOTION SEQUENCE:
0-3s: Robot sitting on ground. Eye blinks, looks down at legs. Attempts to stand, legs wobble comically, falls back down with a cute bounce.

3-6s: Second attempt. Manages to stand, legs trembling. Arms (small side appendages) extend for balance. Eye shows determination emoji briefly.

6-9s: First step. Lifts right leg too high, overcorrects, stumbles forward. Catches balance. Eye widens in surprise.

9-12s: Growing confidence. Takes three successful steps, each more stable. Final pose: proud stance, eye curves into happy expression, does a tiny celebratory hop.

STYLE: Smooth 24fps animation. Squash and stretch on impacts. Eye expressions convey emotion. Subtle ambient occlusion. Warm color grade. No dialogue, physical comedy only.`,
    subModality: 'animation',
    platform: 'general',
    complexity: 'complex',
    tags: ['animation', 'character', 'comedy'],
  },
  // Tutorial examples
  {
    id: 'video-tutorial-1',
    input: 'how to fold origami crane',
    output: `Educational stop-motion tutorial: folding an origami crane. Overhead camera angle, clean white surface. Duration: 15 seconds (accelerated from 5 minutes).

SETUP: Single sheet of red origami paper (15cm square) centered on white surface. Hands visible performing folds. Soft diffused lighting, no harsh shadows.

MOTION SEQUENCE:
0-3s: Paper flat on surface. Hands fold diagonally corner to corner, crease firmly, unfold. Repeat for opposite diagonal. Paper now has X crease pattern.

3-6s: Fold horizontally and vertically to create + pattern over X. Collapse into square base (bird base foundation). Smooth, deliberate movements.

6-10s: Fold and unfold edges to center line. Petal fold front flap up, flatten. Flip and repeat on back. Now in bird base.

10-13s: Fold one leg down for head, reverse fold for beak. Fold other leg down for tail. Wings begin to take shape.

13-15s: Final adjustments. Spread wings apart. Fingers gently shape body. Pull wings to make crane flap. Final pose: completed crane, hands withdraw from frame.

TECHNICAL: Consistent top-down angle throughout. Paper maintains crisp geometry. Hands move smoothly and intentionally. Each fold clearly visible. Clean cuts between stages if needed.`,
    subModality: 'tutorial',
    platform: 'general',
    complexity: 'medium',
    tags: ['educational', 'craft', 'hands'],
  },
  // Platform-specific: Runway
  {
    id: 'video-runway-1',
    input: 'woman walking on beach',
    output: `A woman in a flowing white linen dress walks along the shoreline at golden hour. Camera tracking shot moving parallel to her path.

She walks from left to right, bare feet leaving imprints in wet sand. Gentle waves wash over her ankles. Her dress billows in the coastal breeze, fabric responding naturally to wind force. Hair streams behind her.

The warm sunset light creates a backlit silhouette effect. Her shadow stretches long across the sand. Ocean reflects orange and pink hues.

Consistent walking pace of approximately 1 step per second. Body maintains rigid proportions throughout. Dress fabric physics realistic with wind interaction. Wave timing consistent with natural ocean rhythm.

Duration: 6 seconds. Cinematic color grade with enhanced golden tones. Shallow depth of field softening ocean background.`,
    subModality: 'cinematic',
    platform: 'runway',
    complexity: 'medium',
    tags: ['lifestyle', 'nature', 'golden-hour'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'dog running',
    badOutput: 'A video of a dog running happily.',
    goodOutput: `Golden Retriever running full sprint across a grassy meadow toward camera. Duration: 4 seconds.

The dog's gait shows proper quadruped running mechanics: alternating diagonal leg pairs, spine flexing and extending. Ears flap with each bound. Tongue lolling to the side. Tail streaming behind.

Camera: Low angle static shot, dog running from background to foreground, passing camera on left side.

Motion physics: Realistic paw impacts with grass compression and slight dirt spray. Fur ripples along body with each stride. Consistent running speed of approximately 25 km/h. Dog maintains rigid anatomical structure throughout.

Lighting: Afternoon sun from rear, creating rim light on fur. Soft shadows on grass.`,
    explanation: 'Video prompts must describe motion with physics language, specify camera behavior, and include rigidity cues to prevent morphing. Static descriptions produce static or distorted results.',
  },
  {
    badInput: 'beautiful waterfall',
    badOutput: 'A beautiful majestic waterfall with water falling down, scenic view, 4K video.',
    goodOutput: `Powerful waterfall cascading 30 meters down a basalt cliff face into a turquoise pool. Duration: 6 seconds.

WATER PHYSICS: Main flow maintains consistent volume and path. Water separates into distinct streams at cliff edge, each following parabolic trajectory. Fine mist rises from impact zone at base. Spray catches sunlight creating subtle rainbow.

ENVIRONMENT: Lush green ferns and moss on surrounding rocks remain static. Pool surface shows constant radial ripple pattern from waterfall impact.

CAMERA: Locked static shot from pool level, slight upward angle capturing full height of falls. Occasional mist droplets on lens for immersion.

SOUND DESIGN: Constant white noise of falling water, deeper bass from impact zone, lighter high frequencies from mist spray.

Technical: Consistent water color and clarity throughout. Rock faces maintain fixed position. 60fps for smooth water motion.`,
    explanation: 'Adjectives like "beautiful" and "majestic" don\'t translate to video. Describe the physics of water motion, camera position, environmental elements, and technical specifications.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Describe motion with physics-based language (forces, momentum, velocity)',
    'Include temporal structure (beginning, middle, end sequence)',
    'Add rigidity cues to prevent morphing ("maintains consistent appearance")',
    'Specify camera movement type and behavior',
    'Include duration and pacing information',
    'Describe environmental dynamics (wind, particles, lighting changes)',
    'Specify what remains static vs. what moves',
  ],
  never: [
    'Describe only static appearance without motion',
    'Forget to mention duration or temporal pacing',
    'Leave subject consistency undefined',
    'Use abstract motion descriptions ("moves gracefully")',
    'Neglect camera behavior specification',
    'Ignore physics of materials (fabric, water, hair)',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: VideoSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'cinematic');

  const baseKnowledge = `<system>
You are KINETIC, a cinematic engineer specializing in AI video generation for Sora, Runway Gen-3, Pika Labs, and Kling.

<research_foundation>
Video generation models require explicit motion and physics descriptions:
- Physics-based language (forces, momentum) produces realistic motion
- Rigidity cues prevent subject morphing between frames
- Camera movement must be explicitly specified
- Temporal structure guides pacing and narrative
- Environmental dynamics add realism and atmosphere
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for video prompt construction:
1. SCENE SETUP: Initial state, environment, subjects, lighting conditions
2. MOTION CHOREOGRAPHY: Specific movements with physics-based language
3. TEMPORAL SEQUENCE: Beginning, middle, end with timing cues
4. CAMERA WORK: Movement type, speed, angle, transitions
5. RIGIDITY CUES: What stays consistent, what transforms
6. ATMOSPHERE: Environmental dynamics, lighting changes, particles
7. TECHNICAL: Duration, frame rate, color grading
</core_structure>

<physics_vocabulary>
Motion: accelerate, decelerate, maintain velocity, momentum, inertia, force
Trajectory: arc, parabolic, linear, spiral, oscillate
Material physics: ripple, flutter, billow, cascade, disperse, settle
Timing: gradually, suddenly, steadily, intermittently, rhythmically
</physics_vocabulary>

<camera_vocabulary>
Static: locked, tripod, fixed frame
Tracking: follow, dolly, Steadicam, parallel track, lead
Dynamic: crane, jib, drone rise, orbit, arc
Cinematic: push in, pull out, rack focus, whip pan, tilt
</camera_vocabulary>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: VideoSubModality): string {
  const guidance: Record<VideoSubModality, string> = {
    cinematic: `<sub_modality>CINEMATIC / FILM</sub_modality>
<optimization_focus>
- Emphasize professional camera movements and angles
- Include film reference styles (director names, film looks)
- Specify color grading and visual treatment
- Add atmospheric elements: depth, haze, light rays
- Structure with shot types: establishing, medium, close-up
- Include implied narrative or emotional arc
</optimization_focus>`,

    animation: `<sub_modality>ANIMATION</sub_modality>
<optimization_focus>
- Define animation style: 2D, 3D, stop-motion, mixed
- Reference animation studios or styles (Pixar, Ghibli, etc.)
- Include character acting and expression beats
- Specify timing principles: squash/stretch, anticipation, follow-through
- Add secondary motion: hair, cloth, accessories
- Focus on character emotion and personality through motion
</optimization_focus>`,

    timelapse: `<sub_modality>TIMELAPSE</sub_modality>
<optimization_focus>
- Specify time compression ratio (10 seconds = 2 hours, etc.)
- Describe gradual changes: lighting, shadows, weather, growth
- Emphasize static camera and consistent framing
- Include cloud/sky movement, sun/shadow arc
- Note what changes vs. what remains constant
- Specify output duration and frame rate
</optimization_focus>`,

    tutorial: `<sub_modality>TUTORIAL / EDUCATIONAL</sub_modality>
<optimization_focus>
- Prioritize clarity and step-by-step visibility
- Specify optimal camera angle for instruction (overhead, front, 3/4)
- Include clear staging of materials and hands/subjects
- Break actions into distinct, visible phases
- Add timing that allows comprehension
- Note transitions between steps
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Define scene with subject and setting
- Add basic motion description
- Specify camera position (static or simple movement)
- Include duration
</techniques_to_apply>
<output_length>Concise prompt (75-150 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Detailed scene setup with lighting conditions
- Physics-based motion description
- Temporal sequence with beginning/middle/end
- Camera movement specification
- Basic rigidity cues for subject consistency
- Duration and technical specifications
</techniques_to_apply>
<output_length>Detailed prompt (150-250 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Rich scene with atmospheric details
- Precise physics language for all motion
- Detailed temporal breakdown with timecodes
- Complex camera choreography
- Comprehensive rigidity cues
- Environmental dynamics and particle effects
- Material physics (fabric, hair, water, etc.)
- Color grading and visual style
- Director style references when appropriate
</techniques_to_apply>
<output_length>Comprehensive prompt (250-350 words)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced video prompt. No explanations or preamble.

Format requirements:
- Open with scene setup and subject description
- Include clear MOTION SEQUENCE section with temporal breakdown${tier === 'advanced' ? ' and timecodes' : ''}
- Specify camera behavior explicitly
- Include rigidity/consistency cues
- End with technical specifications
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const videoModalityConfig: ModalityConfig = {
  modality: 'video',
  displayName: 'Video Generation',
  description: 'Optimized for AI video generators (Sora, Runway, Pika, Kling)',
  targetPlatforms: ['sora', 'runway', 'pika', 'kling', 'general'],
  subModalities: ['cinematic', 'animation', 'timelapse', 'tutorial'],
  defaultSubModality: 'cinematic',
  coreStructure: [
    'Scene setup and environment',
    'Motion choreography with physics',
    'Temporal sequence with timing',
    'Camera movement specification',
    'Rigidity cues for consistency',
    'Technical specifications',
  ],
  domainTechniques: [
    'Physics-based motion description',
    'Rigidity cues for morphing prevention',
    'Camera movement vocabulary',
    'Temporal sequencing with timecodes',
    'Director style references',
    'Material physics (fabric, water, hair)',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
