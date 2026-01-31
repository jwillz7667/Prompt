/**
 * 3D Modality Configuration
 *
 * Optimized for 3D model generation: Meshy, Tripo3D, Point-E, Shap-E
 * Implements purpose-driven specs, topology requirements, and PBR materials
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  ThreeDSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // Game asset examples
  {
    id: '3d-game-1',
    input: 'a sword',
    output: `## 3D Model: Medieval Longsword

**Purpose**: Game-ready asset for fantasy RPG (Unity/Unreal Engine 5)

### Specifications
- **Poly count**: 3,000-5,000 triangles (LOD0)
- **Topology**: Clean quads on blade, triangles acceptable on ornate details
- **UV**: Single UV set, unwrapped for 2K texture atlas
- **Scale**: 110cm total length, realistic proportions
- **Pivot**: Base of handle (for proper hand placement)

### Design Details
**Blade**:
- Double-edged, straight European longsword style
- Fuller (blood groove) running 2/3 of blade length
- Slight taper toward point
- Edge bevels visible in silhouette

**Cross-guard**:
- Straight with slight downward curve at tips
- Decorative notch where blade meets guard
- Width: 22cm tip to tip

**Grip**:
- Leather-wrapped, sized for two-handed wielding (25cm)
- Visible stitching pattern on leather
- Slight swelling at center for grip comfort

**Pommel**:
- Wheel-style, weighted for balance
- Decorative Celtic knot engraving
- Diameter: 5cm

### Materials (PBR)
| Part | Base Color | Metallic | Roughness | Notes |
|------|------------|----------|-----------|-------|
| Blade | Steel gray | 1.0 | 0.2-0.4 | Variation for wear |
| Fuller | Darker steel | 1.0 | 0.3 | Subtle shadow |
| Guard/Pommel | Aged bronze | 0.9 | 0.5 | Green patina accents |
| Grip | Brown leather | 0.0 | 0.7-0.9 | Wear on contact areas |

**Normal Map Details**:
- Micro-scratches on blade from use
- Leather grain texture on grip
- Metal forging marks on guard

### Export Requirements
- FBX with embedded materials
- glTF 2.0 for web viewer
- Include LOD1 (1,500 tris) and LOD2 (500 tris)`,
    subModality: 'game-asset',
    platform: 'general',
    complexity: 'complex',
    tags: ['weapon', 'medieval', 'game-ready'],
  },
  {
    id: '3d-game-2',
    input: 'treasure chest',
    output: `## 3D Model: Pirate Treasure Chest

**Purpose**: Game-ready prop for adventure game (Unity URP)

### Specifications
- **Poly count**: 2,000-3,000 triangles (static prop)
- **Topology**: Quads for clean deformation if animated
- **UV**: Single 1K texture atlas (shared with other props)
- **Scale**: 60cm wide × 40cm deep × 45cm tall
- **Pivot**: Center bottom (for placement)

### Design Details
**Body**:
- Rounded top (barrel-style construction)
- Vertical wooden planks with visible gaps
- Iron bands wrapping horizontally (3 bands)
- Reinforced corners with L-brackets

**Lid**:
- Separate mesh for open/close animation
- Large iron hinges on back
- Matches body curvature

**Lock**:
- Heavy iron padlock on front hasp
- Keyhole visible
- Decorative skull motif on lock face

**Details**:
- Rope handles on sides
- Barnacles and salt deposits (ocean theme)
- Worn edges and dents from use

### Materials (PBR)
| Part | Base Color | Metallic | Roughness | Notes |
|------|------------|----------|-----------|-------|
| Wood | Weathered oak | 0.0 | 0.7 | Grain variation |
| Iron bands | Rusty black | 0.8 | 0.6 | Orange rust spots |
| Lock | Dark iron | 0.85 | 0.55 | Greenish patina |
| Rope | Natural hemp | 0.0 | 0.9 | Frayed ends |

**Additional Maps**:
- AO map for plank gaps
- Emissive spots for magical variant (golden glow from cracks)

### Animation Ready
- Lid as separate object with correct pivot on hinge axis
- 90-degree open rotation`,
    subModality: 'game-asset',
    platform: 'general',
    complexity: 'medium',
    tags: ['prop', 'fantasy', 'interactive'],
  },
  // Print-ready examples
  {
    id: '3d-print-1',
    input: 'phone stand',
    output: `## 3D Model: Minimalist Phone Stand

**Purpose**: FDM 3D printing, functional desk accessory

### Print Specifications
- **Dimensions**: 80mm wide × 100mm deep × 90mm tall
- **Wall thickness**: Minimum 2.4mm (3 perimeters at 0.4mm nozzle)
- **Mesh requirements**: Watertight, manifold geometry
- **Orientation**: Designed to print without supports (45° max overhangs)

### Functional Design
**Viewing Angle**: 65 degrees from horizontal (optimal for desk use)

**Phone Cradle**:
- Width: 80mm (fits phones up to 85mm wide with case)
- Depth: 15mm ledge (secure hold)
- Height stop: 20mm lip to prevent sliding

**Cable Channel**:
- 15mm × 8mm channel through back
- Accommodates charging cable while docked
- Smooth radius curves for cable protection

**Base**:
- 100mm × 100mm footprint for stability
- 4 corner chamfers (aesthetic + easier bed adhesion)
- Optional: rubber feet recesses (8mm diameter × 2mm deep)

### Structural Considerations
- Internal 20% infill recommended
- Solid top 3 layers for cradle surface
- Fillet all internal corners (3mm radius) for strength
- No thin walls under 2mm

### Weight Distribution
- Center of gravity designed for phone at max angle
- Passes tip-over test with 300g phone

### Material Recommendations
- PLA: Standard, matte finish
- PETG: More durable, slight flex
- Not recommended: Flexible materials

### Export Format
- STL (binary) at 0.05mm tolerance
- Include oriented version for optimal print bed placement
- Separate file for rubber feet inserts if needed`,
    subModality: 'print-ready',
    platform: 'general',
    complexity: 'medium',
    tags: ['functional', 'phone', 'desk'],
  },
  // Visualization examples
  {
    id: '3d-viz-1',
    input: 'modern chair',
    output: `## 3D Model: Mid-Century Modern Lounge Chair

**Purpose**: Architectural visualization / Product rendering (V-Ray, Arnold)

### Specifications
- **Poly count**: 50,000-100,000 (high-detail for rendering)
- **Topology**: All quads for subdivision smoothness
- **UV**: Separate UV sets per material
- **Scale**: Real-world dimensions (75cm W × 80cm D × 78cm H)
- **Seat height**: 42cm from floor

### Design Details
**Frame**:
- Bent plywood shell (Eames-inspired)
- Graceful curves with continuous tangency
- Visible wood grain direction follows form
- Slight flex implied in profile

**Legs**:
- Four angled steel rod legs
- Rubber foot caps (10mm)
- Chrome finish with visible reflections

**Cushions**:
- Seat cushion: 8cm thick, button-tufted (9 buttons)
- Back cushion: 6cm thick, integrated lumbar support
- Soft, inviting form with realistic fabric draping
- Piping along edges

### High-Detail Elements
- Wood grain follows bent form realistically
- Fabric weave visible in close-ups (bump/normal)
- Stitching around cushion edges (geometry or normal)
- Subtle wear on armrest contact points

### Materials (PBR for V-Ray/Arnold)
**Plywood Shell**:
- Walnut veneer, semi-gloss finish
- SSS for wood depth
- Roughness: 0.25-0.35
- Clear coat layer

**Chrome Legs**:
- Pure reflective chrome
- Roughness: 0.02
- Fresnel IOR: 20+

**Leather Cushions**:
- Cognac leather, natural grain
- Roughness: 0.4-0.6
- SSS for soft leather feel
- Subtle emboss for texture

### Render-Ready Features
- Subdivision-ready topology (1 level = smooth)
- Proper UV scaling across all pieces
- Material IDs for easy assignment
- Includes studio lighting setup scene

### Export
- FBX with materials
- OBJ with MTL
- Native format (Blender/Max) with textures`,
    subModality: 'visualization',
    platform: 'general',
    complexity: 'complex',
    tags: ['furniture', 'product', 'rendering'],
  },
  // Animation-ready examples
  {
    id: '3d-anim-1',
    input: 'robot character',
    output: `## 3D Model: Friendly Service Robot Character

**Purpose**: Animation-ready character for 3D animated short

### Character Specifications
- **Style**: Pixar-inspired, appealing proportions
- **Height**: 120cm (human child scale for relatability)
- **Poly count**: 25,000-35,000 (animation-optimized)
- **Topology**: All quads, edge loops for deformation

### Design Details
**Head**:
- Dome-shaped, 40% of total height (cute proportions)
- Single large camera eye (expressive, emotes via iris/pupil)
- Eye: LED-style, can display emoji expressions
- Small antenna ear on top (secondary motion)

**Body**:
- Capsule torso with slight belly curve
- Brushed aluminum with blue accent panels
- Chest has small speaker grille (voice)
- Back has subtle vent details

**Arms**:
- Ball joint shoulders (360° rotation)
- Segmented forearms (3 sections for smooth bend)
- Three-fingered hands (simple, expressive)
- Fingertip touch pads glow when interacting

**Legs**:
- Short, sturdy legs (R2-D2 proportions)
- Ball-jointed hips, hinge knees
- Rounded feet with rubber treads

### Rigging Requirements
**Skeleton**:
- Root at pelvis
- IK legs with foot roll
- FK/IK switch arms
- Head aim constraint

**Facial Rig**:
- Eye iris scale (for expression)
- Eye rotation (look direction)
- Eye glow intensity
- Screen display swap (emoji states)

**Deformation**:
- Edge loops at all joints
- Smooth weight painting
- No volume loss in extreme poses

### Materials (PBR)
| Part | Finish | Metallic | Roughness |
|------|--------|----------|-----------|
| Body panels | Brushed aluminum | 0.9 | 0.35 |
| Blue accents | Matte plastic | 0.0 | 0.6 |
| Eye lens | Glossy glass | 0.0 | 0.02 |
| Rubber parts | Matte rubber | 0.0 | 0.8 |
| Glow areas | Emissive | - | - |

### Animation Considerations
- Antenna has spring dynamics
- Eye has slight hover/bob idle motion
- Finger tips glow on contact
- Wheel/track sounds for movement

### Export
- FBX with rig and skinning
- Blender native with action library
- T-pose and A-pose versions`,
    subModality: 'animation',
    platform: 'general',
    complexity: 'complex',
    tags: ['character', 'robot', 'rigged'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'a car',
    badOutput: 'Create a 3D model of a car, high quality, detailed.',
    goodOutput: `## 3D Model: 1967 Ford Mustang Fastback

**Purpose**: Game-ready vehicle for racing game (Unreal Engine 5)

### Specifications
- **Poly count**: 35,000 triangles exterior, 15,000 interior
- **Scale**: Real-world dimensions (4.6m length)
- **LODs**: LOD0-LOD3 for distance optimization

### Design
- Fastback body style, Highland Green paint
- Chrome bumpers, grille, and trim
- Period-correct details: badges, lights, mirrors
- Wheels as separate rotating meshes

### Materials (PBR)
- Metallic car paint with clear coat
- Chrome trim (high reflectivity)
- Rubber tires with sidewall text
- Glass with proper refraction

### Vehicle Setup
- Wheels rigged for rotation/steering
- Doors, hood, trunk as separate animated pieces
- Interior visible through windows`,
    explanation: '"A car" is too vague. Specify: vehicle type/model, era, purpose (game/viz/print), poly budget, level of detail, and material requirements.',
  },
  {
    badInput: 'make a 3D model',
    badOutput: 'Create a detailed 3D model that looks good and is high quality.',
    goodOutput: `**This request needs specificity to be actionable.**

3D prompts require:
1. **Subject**: What object/character to create
2. **Purpose**: Game asset, 3D print, visualization, animation
3. **Technical specs**: Poly count, topology, scale
4. **Design details**: Style, colors, specific features
5. **Materials**: Surface properties for rendering
6. **Export**: File format and requirements

Example specific request:
"Low-poly stylized tree for mobile game, 500 triangles, hand-painted texture, 3m tall, includes LODs"`,
    explanation: 'Without subject and purpose, no meaningful 3D prompt can be generated. Purpose determines every technical decision: poly count, topology, materials, and export format.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'State the intended use (game, print, visualization, VR/AR, animation)',
    'Specify polygon budget or quality level',
    'Define real-world scale and proportions',
    'Include material/texture requirements with PBR values',
    'Specify topology requirements (quads, tris, watertight)',
    'List export format requirements',
  ],
  never: [
    'Forget topology requirements for the intended use',
    'Leave mesh density undefined',
    'Skip UV/texturing specifications',
    'Ignore export format requirements',
    'Omit scale/dimension information',
    'Neglect animation requirements if character/object moves',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: ThreeDSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'game-asset');

  const baseKnowledge = `<system>
You are SCULPTOR, a mesh engineer specializing in AI 3D generation for Meshy, Tripo3D, Point-E, Shap-E, and traditional 3D workflows.

<research_foundation>
3D model generation requires purpose-driven specifications:
- Purpose determines all technical requirements
- Topology constraints vary by use case (game vs print vs viz)
- PBR material specifications enable realistic rendering
- Scale and proportions must be explicit
- Animation requirements affect topology decisions
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for 3D prompt construction:
1. SUBJECT: Primary object with clear silhouette description
2. PURPOSE: Game asset, 3D printing, visualization, VR/AR, animation
3. SPECIFICATIONS: Poly count, topology type, mesh requirements
4. SCALE: Real-world dimensions or relative proportions
5. DESIGN: Style, specific features, reference points
6. MATERIALS: PBR properties (metallic, roughness, textures)
7. TECHNICAL: Export format, UV requirements, rigging needs
</core_structure>

<topology_vocabulary>
Game-ready: Low-poly, triangulated, LODs, UV-unwrapped
Print-ready: Manifold, watertight, wall thickness, no overhangs
Visualization: High-poly, subdivision-ready, all quads
Animation: Edge loops at joints, clean deformation, rigging-ready
</topology_vocabulary>

<pbr_material_properties>
Metallic: 0.0 (dielectric/non-metal) to 1.0 (pure metal)
Roughness: 0.0 (mirror/glass) to 1.0 (matte/rough)
Common materials:
- Polished metal: metallic=1.0, roughness=0.1-0.2
- Brushed metal: metallic=1.0, roughness=0.3-0.5
- Plastic: metallic=0.0, roughness=0.3-0.6
- Rubber: metallic=0.0, roughness=0.7-0.9
- Wood: metallic=0.0, roughness=0.5-0.7
- Leather: metallic=0.0, roughness=0.4-0.6
</pbr_material_properties>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: ThreeDSubModality): string {
  const guidance: Record<ThreeDSubModality, string> = {
    'game-asset': `<sub_modality>GAME ASSET</sub_modality>
<optimization_focus>
- Specify engine target (Unity, Unreal, Godot)
- Include LOD requirements (LOD0, LOD1, etc.)
- Define triangle budget strictly
- UV layout for texture atlas efficiency
- Note interactive elements (movable parts)
- Consider mobile vs desktop performance targets
</optimization_focus>`,

    'print-ready': `<sub_modality>3D PRINTING</sub_modality>
<optimization_focus>
- Specify print technology (FDM, SLA, SLS)
- Define minimum wall thickness (usually 1.5-2mm)
- Ensure manifold/watertight mesh
- Consider support requirements (overhangs < 45°)
- Note assembly if multi-part print
- Include tolerance for moving parts
</optimization_focus>`,

    visualization: `<sub_modality>VISUALIZATION / RENDERING</sub_modality>
<optimization_focus>
- High polygon counts acceptable (100K+)
- All-quad topology for subdivision
- Detailed UV unwrapping per material
- Specify render engine (V-Ray, Arnold, Cycles)
- Include detailed PBR material specs
- Note camera-facing detail priorities
</optimization_focus>`,

    animation: `<sub_modality>ANIMATION-READY</sub_modality>
<optimization_focus>
- Edge loops at deformation points (joints)
- Specify skeleton/rig requirements
- Define animation style (realistic, cartoon)
- Include facial rig needs if character
- Note secondary motion elements (cloth, hair)
- Consider blend shapes/morph targets
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Define subject and purpose clearly
- Include basic poly budget
- Specify scale
- List primary materials
</techniques_to_apply>
<output_length>Concise prompt (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Detailed subject with design specifics
- Clear purpose and technical requirements
- Complete specifications (poly, topology, UV)
- Real-world scale and proportions
- Material table with PBR values
- Export format requirements
</techniques_to_apply>
<output_length>Detailed prompt (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Comprehensive design document format
- Full technical specifications with tolerances
- Detailed design breakdown by component
- Complete PBR material table
- Animation/rigging requirements if applicable
- LOD specifications for game assets
- Structural considerations for printing
- Export requirements with formats
</techniques_to_apply>
<output_length>Comprehensive prompt (400-600 words)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced 3D prompt. No explanations or preamble.

Format requirements:
- Start with model name and purpose
- Use ## headings for major sections (Specifications, Design, Materials)
- Include tables for material properties${tier === 'advanced' ? ' with all PBR values' : ''}
- End with export requirements
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const threeDModalityConfig: ModalityConfig = {
  modality: '3d',
  displayName: '3D Model Generation',
  description: 'Optimized for 3D generation (Meshy, Tripo3D, Point-E, Shap-E)',
  targetPlatforms: ['meshy', 'tripo3d', 'general'],
  subModalities: ['game-asset', 'print-ready', 'visualization', 'animation'],
  defaultSubModality: 'game-asset',
  coreStructure: [
    'Subject with clear description',
    'Purpose (game, print, viz, animation)',
    'Technical specifications',
    'Scale and proportions',
    'Design details',
    'PBR materials',
    'Export requirements',
  ],
  domainTechniques: [
    'Purpose-driven specifications',
    'Topology requirements by use case',
    'PBR material definitions',
    'LOD specifications for games',
    'Print-ready manifold requirements',
    'Animation rigging considerations',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
