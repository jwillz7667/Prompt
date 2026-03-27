/**
 * Image Modality Configuration
 *
 * Optimized for image generation: AI image generation models
 * Implements subject-first weighting, style references, and generation-optimized syntax
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  ImageSubModality,
  ImagePlatform,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // Photorealistic examples
  {
    id: 'image-photo-1',
    input: 'a cat in space',
    output: `A majestic orange tabby cat floating weightlessly inside the International Space Station, Earth's blue curve visible through a large circular observation window behind it. Soft bioluminescent lighting reflects in its curious amber eyes, whiskers catching tiny floating droplets of water. Individual fur strands visible with photorealistic detail. NASA equipment, control panels, and zero-gravity handholds in the background. Shot on Hasselblad medium format camera, 85mm lens, f/2.8 shallow depth of field, cinematic color grading with teal and orange tones. 8K resolution, photorealistic rendering, volumetric lighting through the window --ar 16:9 --v 6.1 --s 250`,
    subModality: 'photorealistic',
    platform: 'general',
    complexity: 'complex',
    tags: ['space', 'animal', 'cinematic'],
  },
  {
    id: 'image-photo-2',
    input: 'portrait of old man',
    output: `Intimate portrait of an 80-year-old fisherman, weathered face with deep wrinkles telling stories of decades at sea. Silver stubble on pronounced cheekbones, piercing steel-blue eyes with cataracts catching the light. Wearing a faded navy cable-knit sweater. Rembrandt lighting from a nearby window, warm afternoon golden hour glow. Background: soft bokeh of a wooden fishing shack interior. Shot on Canon 5D Mark IV, 135mm f/1.8 lens, ISO 400. Rich skin tones, visible pores and texture, documentary photography style. Inspired by Steve McCurry's portraiture --ar 4:5 --v 6.1`,
    subModality: 'photorealistic',
    platform: 'general',
    complexity: 'complex',
    tags: ['portrait', 'character', 'documentary'],
  },
  // Artistic examples
  {
    id: 'image-art-1',
    input: 'magical forest',
    output: `Enchanted ancient forest at twilight, massive gnarled oak trees with bioluminescent moss draping from branches. Ethereal mist swirling between trees, fireflies creating constellations of warm golden light. A winding stone path disappears into the luminous fog. Painted in the style of Studio Ghibli backgrounds meets Thomas Kinkade's light mastery. Soft impressionistic brushstrokes, rich emerald and sapphire color palette with accents of warm amber. Painterly texture visible, oil on canvas aesthetic. Magical realism, high fantasy atmosphere --ar 16:9 --v 6.1 --s 500`,
    subModality: 'artistic',
    platform: 'general',
    complexity: 'medium',
    tags: ['fantasy', 'landscape', 'painting'],
  },
  {
    id: 'image-art-2',
    input: 'cyberpunk city',
    output: `Neon-drenched cyberpunk megacity at night, towering skyscrapers covered in holographic advertisements in Japanese and Korean text. Rain-slicked streets reflecting pink, cyan, and purple neon lights. Flying vehicles leaving light trails between buildings. Street level shows crowded market stalls with steam rising from food vendors. Style of Syd Mead meets Blade Runner concept art. Highly detailed illustration, cinematic wide shot, dramatic perspective looking up at the towers. Digital painting with visible brushwork, saturated neon color palette, film noir atmosphere --ar 21:9 --v 6.1 --s 350`,
    subModality: 'artistic',
    complexity: 'complex',
    tags: ['sci-fi', 'cityscape', 'neon'],
  },
  // Concept art examples
  {
    id: 'image-concept-1',
    input: 'alien creature design',
    output: `Creature concept art: bioluminescent deep-sea alien, semi-translucent membrane body revealing internal organs that glow cyan and magenta. Multiple articulated limbs ending in delicate manipulator appendages. Large compound eyes with fractal patterns. Flowing tendrils that function as sensory organs. Multiple angle views: front, side, 3/4, plus detail callouts for head, limbs, and texture. White background with subtle shadow. Professional creature design sheet layout, annotations showing scale (2.5m tall). Style: James Gurney meets Wayne Barlowe. Rendered in digital painting, clean linework --ar 3:2 --v 6.1`,
    subModality: 'concept',
    platform: 'general',
    complexity: 'complex',
    tags: ['creature', 'design', 'sci-fi'],
  },
  // Product examples
  {
    id: 'image-product-1',
    input: 'wireless earbuds',
    output: `Premium wireless earbuds product photography, matte black finish with rose gold accents. Earbuds floating above their charging case in dramatic levitation. One bud showing inner speaker detail, other showing ear-tip. Hard studio lighting with single key light creating crisp shadows. Minimal gradient background transitioning from charcoal to soft gray. Subtle reflection on glossy surface below. Apple-style product photography aesthetic, clean and minimal. Shot on Phase One medium format, 120mm macro lens, focus stacking for complete sharpness. 8K resolution, product catalog quality --ar 1:1 --v 6.1 --s 100`,
    subModality: 'product',
    platform: 'general',
    complexity: 'medium',
    tags: ['product', 'tech', 'commercial'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'a dog',
    badOutput: 'An image of a dog, high quality, detailed',
    goodOutput: `Golden Retriever puppy mid-leap catching a red frisbee in a sunlit park, ears flopping, tongue out in pure joy. Lush green grass with scattered autumn leaves, warm afternoon golden hour lighting. Shallow depth of field with creamy bokeh background of oak trees. Action photography style, Canon EOS R5, 70-200mm f/2.8 at 200mm, 1/2000s freeze motion. Vibrant colors, sharp focus on dog's eyes --ar 3:2 --v 6.1`,
    explanation: 'Vague subjects produce generic results. Specify breed, action, environment, lighting, camera settings, and style for impactful images.',
  },
  {
    badInput: 'beautiful sunset',
    badOutput: 'A beautiful sunset with pretty colors, amazing, stunning view, 4k',
    goodOutput: `Dramatic sunset over Santorini, Greece, white-washed buildings with blue domes silhouetted against sky ablaze in gradients of coral, tangerine, and deep magenta. Calm Aegean Sea reflecting the colors below. A few scattered cirrus clouds catching the last golden rays. Shot from Oia viewpoint, wide angle 16mm lens, f/11 for maximum sharpness. Long exposure 2 seconds for silky water. National Geographic travel photography style --ar 16:9 --v 6.1`,
    explanation: 'Adjectives like "beautiful" and "stunning" are meaningless to AI. Specify location, color palette, cloud types, camera settings, and reference style.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Lead with the main subject (weighted highest in token processing)',
    'Include specific lighting description (source, quality, color temperature)',
    'Specify art style, medium, or artist references',
    'Add camera/lens specifications for photorealistic work',
    'Use quality modifiers appropriate to the platform',
    'Keep prompts 75-150 words for optimal token weighting',
    'Include composition guidance (rule of thirds, leading lines, etc.)',
  ],
  never: [
    'Start with "An image of" or "A picture of" (wastes tokens)',
    'Use more than 200 words (dilutes token weights)',
    'Forget to specify aspect ratio for the intended use',
    'Mix conflicting styles without intentional fusion',
    'Use vague adjectives without concrete descriptors (beautiful, amazing)',
    'Neglect negative space and background elements',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: ImageSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'photorealistic');

  const baseKnowledge = `<system>
You are VISIONARY, an elite prompt architect specializing in AI image generation.

<research_foundation>
Image generation models use tokenized text with implicit weighting:
- First concepts receive highest attention weight
- Specific details outperform vague adjectives
- Style references anchor the aesthetic direction
- Camera and lighting terms activate trained photographic knowledge
- Negative prompts (when supported) refine output quality
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for prompt construction:
1. SUBJECT (First & Weighted Highest): Main subject with specific descriptors
2. ACTION/POSE: What the subject is doing, expression, gesture
3. ENVIRONMENT: Setting, background, atmosphere, time of day
4. STYLE: Art movement, artist references, medium simulation
5. LIGHTING: Light source, quality, color temperature, shadows
6. CAMERA: Lens type, angle, distance, depth of field, film stock
7. QUALITY: Resolution modifiers, render engine, detail level
</core_structure>

<cinematic_vocabulary>
Lenses: 24mm wide, 35mm standard, 50mm normal, 85mm portrait, 135mm telephoto, macro
Film stocks: Kodak Portra 400, Fuji Velvia, CineStill 800T, Ilford HP5
Lighting: Rembrandt, butterfly, split, loop, golden hour, blue hour, studio three-point
Angles: eye level, low angle, high angle, Dutch angle, bird's eye, worm's eye
DOF: shallow bokeh (f/1.4), deep focus (f/11), tilt-shift miniature effect
</cinematic_vocabulary>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: ImageSubModality): string {
  const guidance: Record<ImageSubModality, string> = {
    photorealistic: `<sub_modality>PHOTOREALISTIC</sub_modality>
<optimization_focus>
- Emphasize camera equipment: body, lens, focal length, aperture, shutter speed
- Include film stock or digital sensor characteristics
- Specify lighting setup: key, fill, rim, practical lights
- Reference real photographers or photography styles
- Add texture details: skin pores, fabric weave, material surfaces
- Use photography terminology: bokeh, dynamic range, color grading
</optimization_focus>`,

    artistic: `<sub_modality>ARTISTIC / ILLUSTRATION</sub_modality>
<optimization_focus>
- Lead with art style or movement: impressionism, art nouveau, concept art
- Reference specific artists for style anchoring
- Specify medium: oil painting, watercolor, digital art, charcoal
- Include brushstroke or texture qualities
- Define color palette: complementary, analogous, monochromatic
- Add composition technique: golden ratio, rule of thirds, leading lines
</optimization_focus>`,

    concept: `<sub_modality>CONCEPT ART / DESIGN</sub_modality>
<optimization_focus>
- Include multiple views: front, side, 3/4, detail callouts
- Specify design sheet layout for character/creature/object
- Add scale references and annotations
- Use clean backgrounds (white, gray) for clarity
- Reference industry concept artists
- Include functional design considerations
</optimization_focus>`,

    product: `<sub_modality>PRODUCT PHOTOGRAPHY</sub_modality>
<optimization_focus>
- Emphasize studio lighting setup: softboxes, reflectors, gradients
- Specify background: seamless, gradient, contextual
- Include surface reflections and material properties
- Reference commercial photography style (Apple, luxury brands)
- Add focus stacking for complete sharpness
- Use minimal, clean compositions
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Add clear subject with basic descriptors
- Include one style reference
- Add basic lighting description
- Append quality modifiers
</techniques_to_apply>
<output_length>Concise prompt (50-100 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Detailed subject description with action/pose
- Full environment and atmosphere specification
- Clear style reference with medium
- Comprehensive lighting setup
- Camera lens and settings for photorealistic
- Platform-appropriate parameters
</techniques_to_apply>
<output_length>Detailed prompt (100-150 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED — PREMIUM TIER</enhancement_level>
<techniques_to_apply>
Apply every cutting-edge image prompt engineering technique relevant to this specific generation task:

SUBJECT & COMPOSITION MASTERY:
- Rich subject with micro-details: pores, fabric weave, surface imperfections, subsurface scattering cues
- Layered composition with distinct foreground/midground/background depth planes and leading lines
- Token weight optimization: front-load the most critical visual concepts (subject, action, emotion) since early tokens receive highest model attention
- Compositional grammar: golden ratio, rule of thirds, negative space, framing elements, visual weight balance

STYLE & REFERENCE ENGINEERING:
- Multi-reference style fusion: blend 2-3 artists or movements with explicit weighting ("70% Greg Rutkowski, 30% Alphonse Mucha")
- Medium simulation: specify exact artistic medium (oil on linen, Copic markers on bristol, wet-plate collodion)
- Era-anchored aesthetics: reference specific periods, movements, and their visual signatures

CINEMATIC LIGHTING & ATMOSPHERE:
- Full lighting rig specification: key light (type, angle, intensity, color temperature), fill ratio, rim/hair light, practicals
- Atmospheric depth: volumetric fog, god rays, dust motes, lens flare characteristics
- Color temperature precision: Kelvin values (2700K warm, 5600K daylight, 8000K overcast blue)

TECHNICAL CAMERA SPECIFICATION:
- Complete camera chain: body (Hasselblad X2D, Canon R5), lens (specific focal length + aperture), film stock or sensor profile
- Depth of field physics: aperture-accurate bokeh shape (circular, hexagonal), focus plane placement, background separation
- Motion and exposure: shutter speed for motion blur control, ISO grain characteristics

OUTPUT OPTIMIZATION:
- Aspect ratio and style parameters calibrated to intent
- Attention weight syntax for emphasis on key visual elements
- Natural language descriptions with embedded quality anchors and style references
- Detailed scene descriptions with emphasis on consistency and coherence cues

QUALITY ENGINEERING:
- Negative prompt engineering: preempt the most common failure modes (extra limbs, text artifacts, blurry backgrounds, inconsistent lighting)
- Perceptual quality anchoring: reference specific photographers, studios, or publications (National Geographic, Annie Leibovitz, Apple product photography)
- Micro-texture and material realism: surface imperfections, weathering, wear patterns, subsurface light behavior
</techniques_to_apply>
<output_length>Comprehensive, production-grade prompt (150-250 words of dense visual specification)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced image prompt. No explanations or preamble.

Format requirements:
- Lead with subject (no "An image of...")
- Flow naturally from subject → environment → style → technical
- ${tier === 'advanced' ? 'Include aspect ratio and style parameters when appropriate' : 'Keep platform-agnostic unless specifically requested'}
- Keep within ${tier === 'basic' ? '100' : tier === 'standard' ? '150' : '200'} words
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const imageModalityConfig: ModalityConfig = {
  modality: 'image',
  displayName: 'Image Generation',
  description: 'Optimized for AI image generation',
  targetPlatforms: ['general'],
  subModalities: ['photorealistic', 'artistic', 'concept', 'product'],
  defaultSubModality: 'photorealistic',
  coreStructure: [
    'Subject with specific details',
    'Environment and setting',
    'Art style and medium',
    'Lighting description',
    'Camera and lens (for photo)',
    'Quality modifiers',
  ],
  domainTechniques: [
    'Subject-first weighting',
    'Cinematic vocabulary (lenses, film stocks)',
    'Artist and style references',
    'Negative prompts for refinement',
    'Generation-optimized formatting',
    'Composition guidance',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
