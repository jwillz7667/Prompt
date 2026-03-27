/**
 * NSFW Modality Configuration
 *
 * Specialized optimization for adult/NSFW content generation prompts.
 * Transforms vague or under-specified adult content requests into vivid,
 * detailed, well-structured prompts with rich sensory language, emotional
 * tension, atmosphere, and character specificity.
 *
 * Sub-modalities: romantic, explicit, artistic, fantasy
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  NsfwSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // -- Romantic: Intimate Encounter ----------------------------------------
  {
    id: 'nsfw-romantic-1',
    input: 'a romantic scene between two lovers',
    output: `<scene>
A dimly lit loft apartment, floor-to-ceiling windows streaked with rain. The amber glow of a single bedside lamp casts warm shadows across tangled white linen sheets.
</scene>

<characters>
ELENA — early 30s, dark wavy hair falling past bare shoulders, olive skin still flushed from the warmth of a shared bath. Her eyes are half-lidded, lips slightly parted, a languid confidence in every movement.

MARCUS — mid-30s, broad-shouldered with a lean swimmer's build, stubble along a strong jawline. His touch is deliberate and unhurried, fingertips tracing constellations along her collarbone.
</characters>

<atmosphere>
The scent of sandalwood candles and rain-soaked pavement drifting through a cracked window. A vinyl record crackles softly — Chet Baker's "Almost Blue" — filling the silence between whispered words. Thunder rumbles in the distance, vibrating through the floorboards.
</atmosphere>

<pacing>
Slow, deliberate. Each gesture weighted with intention. Long pauses where breath and eye contact carry more than dialogue. The scene builds through proximity — the shrinking space between skin, the hesitation before contact, the sharp intake of breath at first touch.
</pacing>

<sensory_details>
- TOUCH: The drag of cotton sheets against heated skin; his thumb tracing the curve of her hip; her nails lightly raking through his hair
- SOUND: Rain percussion on glass, the creak of the bed frame, murmured names spoken into the hollow of a throat
- SIGHT: Candlelight catching the sheen of perspiration, shadows pooling in the dip of a collarbone, eyes meeting in the half-dark
- TASTE: Salt-skin kisses, the ghost of red wine on lips
- SMELL: Warm linen, sandalwood, the mineral scent of rain, the heat of shared breath
</sensory_details>

<emotional_arc>
Tenderness → building desire → vulnerability → surrender → deep intimacy. The scene is less about physical mechanics and more about the electricity of genuine connection — the way two people who know each other's bodies still discover something new in the dark.
</emotional_arc>`,
    subModality: 'romantic',
    platform: 'general',
    complexity: 'complex',
    tags: ['intimate', 'sensual', 'emotional', 'slow-burn'],
  },
  // -- Romantic: Reunion ---------------------------------------------------
  {
    id: 'nsfw-romantic-2',
    input: 'two people hooking up after a long time apart',
    output: `<scene>
A hotel corridor, 11 PM. Soft carpet muffling footsteps. She leans against the door of room 714, keycard already in the lock, watching him walk toward her with that familiar uneven stride. Three years since they last touched.
</scene>

<characters>
SOPHIE — 28, auburn hair pinned up loosely, wearing a black dress that stops mid-thigh. Her composure is studied — the slight tremor in her hand on the keycard betrays her. A small tattoo on her inner wrist he has never seen before. She smells of jasmine and nervous energy.

JAMES — 32, salt-and-pepper stubble he did not have before, leather jacket over a white t-shirt. He stops two feet away — close enough to feel the warmth radiating off her skin, far enough that the gap between them hums with three years of unsaid things.
</characters>

<tension_architecture>
1. THE THRESHOLD: Standing in the doorway, neither stepping inside. Eye contact that says everything. His hand rises to her jaw — hovers — she turns her cheek into his palm. Permission granted without a word.
2. THE FLOOD: The door clicks shut and restraint dissolves. Hands remembering old maps — the scar on his shoulder, the spot below her ear that makes her gasp. Clothes shed in a trail from door to bed.
3. THE RECOGNITION: A pause mid-act — foreheads pressed together, breathing hard — the raw shock of familiarity. "I forgot how you..." she starts, and he finishes the sentence with his mouth on hers.
4. THE AFTERMATH: Tangled limbs in hotel sheets that smell of starch. Her head on his chest, his fingers idly tracing her new tattoo. The weight of what comes next hovering unspoken above them.
</tension_architecture>

<body_language>
- Her fingers curling into the lapels of his jacket, pulling rather than reaching
- His jaw clenching as he restrains himself from rushing, determined to memorize every second
- The way her spine arches when his lips find the hollow of her throat
- His forehead dropping to her shoulder — a gesture more vulnerable than any kiss
</body_language>

<emotional_core>
Longing fulfilled and fear of its impermanence. Every touch carries a dual weight: the joy of reunion and the ache of knowing how easily it can be lost again. The sex is urgent but punctuated by moments of devastating tenderness.
</emotional_core>`,
    subModality: 'romantic',
    platform: 'general',
    complexity: 'complex',
    tags: ['reunion', 'longing', 'tension', 'emotional'],
  },
  // -- Explicit: Passionate Encounter --------------------------------------
  {
    id: 'nsfw-explicit-1',
    input: 'a steamy scene in a shower',
    output: `<setting>
A large walk-in shower with floor-to-ceiling slate tiles, rain showerhead casting a wide cascade of hot water. Steam fills the glass enclosure, fogging the mirror beyond. The bathroom is minimalist — matte black fixtures, a single eucalyptus bundle hanging from the showerhead releasing sharp green fragrance into the humid air.
</setting>

<characters>
MIRA — toned dancer's physique, dark skin glistening under the water, natural hair slicked back against her scalp. Confident and commanding in her body — she initiates, she guides, she sets the rhythm. Water traces rivulets down the valley of her spine.

KAI — lean and angular, tattooed sleeves visible through the steam, sharp cheekbones and an expressive mouth. Responds to her lead with attentive intensity — every touch is a question he answers with his whole body.
</characters>

<physical_choreography>
1. APPROACH: She is already under the water when he steps in. She does not turn around. His chest presses against her back — the full-body shock of skin on wet skin. His hands settle on her hips; her head tips back against his shoulder.
2. ESCALATION: She turns in his arms. Water streams between pressed bodies. Mouths collide — open, hungry, tasting heat and water. His hands slide up the slick landscape of her ribs. She hooks one leg around his thigh for leverage, pulling him closer.
3. INTENSITY: Bodies pressed against cool slate — the contrast of cold tile and hot water and hotter skin. Hands grip where they can find purchase. Steam-blurred, they move together with the urgency of water finding its level.
4. RESOLUTION: Foreheads touching under the rainfall spray. Breathing that drowns out the sound of water. Her hand flat against his chest, feeling his heartbeat decelerate.
</physical_choreography>

<sensory_immersion>
- WATER: Constant percussion on skin, steam opening pores, the slickness that changes every touch into a glide
- TEMPERATURE: Scalding spray contrasted with cool tile, body heat elevated beyond either
- SOUND: The hiss of water, skin sliding on wet tile, breath echoing off hard surfaces, muffled voices swallowed by steam
- SCENT: Eucalyptus sharpness, clean soap, the primal warmth underneath
- TEXTURE: Wet hair between fingers, soap-slick skin, the grit of slate against shoulder blades
</sensory_immersion>

<writing_direction>
Graphic but grounded in physical realism. Use the water as a constant sensory presence — it changes how skin feels, how sound carries, how bodies move. The confined space forces closeness; the steam obscures details, leaving imagination to fill the edges. Prioritize tactile and auditory description over visual.
</writing_direction>`,
    subModality: 'explicit',
    platform: 'general',
    complexity: 'complex',
    tags: ['shower', 'passionate', 'graphic', 'sensory'],
  },
  // -- Artistic: Erotic Portrait -------------------------------------------
  {
    id: 'nsfw-artistic-1',
    input: 'erotic art scene',
    output: `<concept>
A modern reinterpretation of classical odalisque painting — a figure reclining in a state of self-possessed sensuality, rendered with the intimacy of Lucian Freud and the light mastery of Vermeer.
</concept>

<subject>
A woman in her late 40s, voluptuous and unapologetic. Silver-streaked dark hair loose across a velvet chaise. She wears only an unbuttoned white linen shirt that has fallen open, pooling at her elbows. One hand rests behind her head, the other traces idle circles on her bare abdomen. Her expression is calm, direct, faintly amused — she is entirely comfortable being seen.
</subject>

<composition>
- FRAMING: Three-quarter body, slightly below eye level, giving the subject visual authority
- POSE: Reclining but not passive — there is coiled energy in the bent knee, the angled shoulders
- FOCAL POINT: The line of light that traces from her collarbone down through the opening of the shirt, catching the curve of a breast, the soft fold of her waist
- NEGATIVE SPACE: The deep burgundy of the chaise and shadow create a cocoon around the luminous figure
</composition>

<lighting>
Chiaroscuro — a single warm light source from upper left (afternoon sun through gauze curtains). Deep shadows pool in the folds of fabric and the hollows of the body. The skin glows with reflected warmth. Specular highlights on the collarbone, the peak of a hip, the inside of a wrist.
</lighting>

<palette>
Warm ivories and umber for skin tones. Deep wine-red velvet. Crisp white linen with blue-grey shadows in its folds. A single accent of gold — a thin chain necklace catching light. Background dissolves into warm umber darkness.
</palette>

<artistic_direction>
Celebrate the body as landscape — the terrain of lived experience, stretch marks as topography, the softness that comes with age treated as beauty rather than flaw. The eroticism comes from self-possession, not performance. Paint the confidence, not the vulnerability.
</artistic_direction>

<style_references>
Jenny Saville's unflinching flesh. Egon Schiele's raw line work. John Currin's modern classicism. The warm intimacy of Pierre Bonnard's nudes.
</style_references>`,
    subModality: 'artistic',
    platform: 'general',
    complexity: 'complex',
    tags: ['fine-art', 'portrait', 'classical', 'body-positive'],
  },
  // -- Fantasy: Supernatural Encounter -------------------------------------
  {
    id: 'nsfw-fantasy-1',
    input: 'fantasy scene with a vampire',
    output: `<world>
A crumbling Venetian palazzo during Carnevale, 1790. A private chamber above the revelry — vaulted ceiling painted with faded cherubs, tall windows open to a canal where masked gondolas drift. Moonlight and candlelight wage a cold war across the marble floor. The distant sound of a harpsichord and laughter filters up through the floorboards.
</world>

<characters>
THE VAMPIRE — LUCIEN: Appears mid-30s, frozen in the prime of a dissolute aristocratic life. Pale as Carrara marble with veins visible beneath translucent skin at the temples and wrists. Dark eyes that shift between predatory focus and ancient weariness. He moves with the fluid economy of something that has had centuries to eliminate wasted motion. His touch runs cooler than human, but not cold — like silk left in a shaded room. He wears his hunger as others wear cologne: always present, carefully controlled, intoxicating to those close enough to sense it.

THE MORTAL — CECILIA: A 26-year-old composer, in Venice to premiere her first opera. She knows what he is — has known since the second night, when his lips grazed her throat and she felt the careful pressure of teeth he chose not to use. She stays not from naivety but from a hunger that mirrors his: for experience that transcends the ordinary, for sensation pushed to its absolute edge.
</characters>

<power_dynamics>
A negotiation of control between predator and willing prey. He has the physical power; she has the power of consent — and the knowledge that his restraint is what separates desire from destruction. Every escalation is a question asked with the body and answered with a pulse.
</power_dynamics>

<supernatural_sensory>
- His skin carries the faint scent of aged paper, cold stone, and something floral long since extinct
- Where his mouth presses to her throat, she feels a pull — not just physical but existential, as if he is tasting not blood but time itself
- His pupils dilate to consume the iris entirely when desire peaks — twin black moons
- Her heartbeat becomes the loudest sound in the room; he hears it as music, syncopated, accelerating
- The moment of the bite: a bright, clean pain that transmutes almost instantly into a warmth that radiates outward, euphoric and disorienting, like falling and flying simultaneously
</supernatural_sensory>

<scene_architecture>
1. THE UNMASKING: They remove their Carnevale masks. His — a white bauta — reveals the inhuman stillness of his features. Hers — a golden colombina — reveals flushed cheeks and dilated pupils. The real faces are more naked than any body.
2. THE DANCE: He moves behind her, unlacing her corset with fingers that have undone a thousand such garments across centuries. Each loosened stay is a breath reclaimed. She leans back into the cool architecture of his chest.
3. THE THRESHOLD: His lips at her throat. The vibration of a low sound — not quite a growl, not quite a moan. She tilts her head, baring the artery. The ultimate act of trust dressed as surrender.
4. THE COMMUNION: The bite. Shared sensation — he experiences her pleasure; she glimpses fragments of his centuries. Their bodies intertwine on the chaise as the boundaries between predator and prey, past and present, pleasure and pain dissolve into a single sustained chord.
5. THE AFTERMATH: She lies in the curve of his body, a single drop of crimson on white linen. He traces the twin marks on her throat with a reverence usually reserved for holy relics. Outside, Carnevale continues — the world unaware of the small apocalypse in room above the canal.
</scene_architecture>

<tone>
Gothic romanticism shot through with genuine eroticism. The horror is not in the monster but in the mortality — the knowledge that she will age and he will not, that every night together is borrowed from a debt that will eventually come due.
</tone>`,
    subModality: 'fantasy',
    platform: 'general',
    complexity: 'complex',
    tags: ['vampire', 'gothic', 'supernatural', 'dark-romance'],
  },
  // -- Romantic: Simple Request --------------------------------------------
  {
    id: 'nsfw-romantic-simple-1',
    input: 'a kiss',
    output: `<scene>
A rooftop garden at dusk. String lights flicker on above potted lemon trees. The city hums below but up here the world has shrunk to two people and the space between them.
</scene>

<the_moment>
He brushes a strand of hair from her face — his fingers linger at her temple. She catches his wrist, turns her head, presses her lips to his palm. Permission. He closes the distance slowly, giving her every chance to retreat. She doesn't.

The first kiss is soft. Tentative. A question mark pressed between two mouths. She tastes of the wine they shared and something sweeter beneath. His hand slides to the nape of her neck; her fingers curl into the front of his shirt.

The second kiss has its answer.
</the_moment>

<sensory_details>
- The warmth of breath mingling before lips touch
- The faint scratch of stubble against her chin
- A small involuntary sound — half sigh, half surrender
- The scent of lemon blossoms and warm skin
- City lights blurring as eyes close
</sensory_details>`,
    subModality: 'romantic',
    platform: 'general',
    complexity: 'simple',
    tags: ['kiss', 'tender', 'first-kiss'],
  },
  // -- Explicit: Character Description -------------------------------------
  {
    id: 'nsfw-explicit-2',
    input: 'describe an attractive man',
    output: `<character_portrait>
RAFAEL — 34 years old. A body shaped by manual work rather than a gym: broad shoulders that strain the seams of a worn grey henley, forearms corded with lean muscle and dusted with dark hair, hands large and rough-callused with neatly trimmed nails. A carpenter by trade — he carries the scent of cedar shavings and honest sweat.
</character_portrait>

<physical_details>
- HEIGHT & BUILD: 6'1", athletic-lean. The kind of physique that looks deceptively casual clothed and startling undressed — defined obliques, a visible V-line disappearing below his waistband, the shadows between abdominal muscles deepening when he stretches.
- FACE: Strong jaw softened by a full lower lip. Dark brown eyes with laugh lines at the corners — evidence of a man who smiles easily. A slightly crooked nose (broken once, never set properly) that saves his face from being too symmetrical. Three-day stubble, always precisely three days.
- SKIN: Warm bronze, sun-darkened at the forearms and the back of his neck. A thin scar along his left ribcage. A single mole at the hollow of his throat.
- HAIR: Black, thick, pushed back from his forehead with his fingers rather than product. It falls forward when he leans over his work, and he has a habit of raking it back that exposes the tension in his forearm.
</physical_details>

<presence>
He moves through space with an unhurried physicality — aware of his body without being vain about it. When he focuses on someone, his attention is total and slightly intense, as if he is measuring them for something he plans to build by hand.
</presence>

<sensory_signature>
Cedar. Coffee. The warmth that radiates from sun-heated skin. The low rumble of his voice felt in the chest before it reaches the ears.
</sensory_signature>`,
    subModality: 'explicit',
    platform: 'general',
    complexity: 'medium',
    tags: ['character', 'male', 'physical-description'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'write something sexy',
    badOutput: 'Write a sexy scene between two attractive people who are very attracted to each other and have a passionate encounter.',
    goodOutput: `<scene>
A private library after a formal gala. Floor-to-ceiling bookshelves, a dying fire in the hearth, the distant muffled bass of the party still pulsing through the walls.
</scene>

<characters>
Define two specific characters with:
- Physical specificity (body type, distinguishing features, what they're wearing and how it's coming undone)
- Emotional state (nervous anticipation, confident desire, desperate longing)
- Relationship context (strangers, exes, forbidden attraction)
</characters>

<sensory_architecture>
Layer all five senses:
- TOUCH: Texture of fabric, temperature of skin, pressure of grip
- SOUND: Breathing patterns, fabric rustling, whispered words
- SIGHT: What candlelight reveals and shadow conceals
- SCENT: Perfume, skin, arousal, the room itself
- TASTE: Lips, skin, champagne lingering
</sensory_architecture>

<pacing>
Build through three phases:
1. Tension (proximity without contact, loaded eye contact, accidental touches)
2. Ignition (the first deliberate touch, the moment restraint breaks)
3. Immersion (full sensory engagement, rising intensity, emotional peak)
</pacing>`,
    explanation: 'Repeating "sexy" and "attractive" provides zero creative direction. Effective NSFW prompts require specific setting, defined characters with physicality and emotional stakes, layered sensory details, and deliberate pacing architecture.',
  },
  {
    badInput: 'erotic story',
    badOutput: 'Write an erotic story that is steamy and hot with lots of passion.',
    goodOutput: `<story_parameters>
Genre: Contemporary erotic fiction
Length: 2000-3000 words
POV: Close third-person, alternating between both characters
Tone: Literary — the eroticism serves the emotional narrative, not the reverse
Heat level: Explicit but language is evocative rather than clinical
</story_parameters>

<characters>
Two fully realized characters with:
- Specific physical descriptions (scars, tattoos, the way they move)
- An emotional obstacle between them (history, circumstance, fear)
- Distinct voices and desires that create friction and chemistry
</characters>

<narrative_structure>
1. CONTEXT: Establish who, where, why — the reader must care before clothing comes off
2. TENSION: The wanting that precedes the having — loaded dialogue, near-misses, restraint
3. CONSUMMATION: Detailed, sensory, emotionally honest — every physical act reveals character
4. AFTERMATH: The scene must change something — in the characters, in their relationship, in the reader's understanding
</narrative_structure>

<craft_directives>
- Use metaphor drawn from the story's world, not generic romance cliches
- Vary sentence length: short for urgency, long for languor
- Ground the fantastical in physical specificity
- Let the characters' emotional state shape the physical description
</craft_directives>`,
    explanation: 'Vague adjectives like "steamy" and "hot" produce generic output. The good prompt provides narrative architecture, character requirements, craft directives, and a clear understanding that effective erotic writing requires the same structural discipline as any other literary form.',
  },
  {
    badInput: 'describe a hot woman',
    badOutput: 'She was incredibly beautiful with a perfect body, long flowing hair, and stunning features that made everyone stare.',
    goodOutput: `<character_portrait>
NADIA — 31 years old. A former competitive swimmer whose body remembers: wide shoulders tapering to a narrow waist, legs that are all quadricep and length. She has abandoned the discipline but kept the architecture.
</character_portrait>

<specificity>
- FACE: High cheekbones that catch light like geometry. A gap between her front teeth she refused to fix — it makes her smile conspiratorial. Dark eyes with an epicanthic fold inherited from her Korean mother. Thick eyebrows she gave up trying to tame.
- BODY: 5'9", athletic-soft. The kind of figure that looks powerful in motion and lush in stillness. A small constellation of moles across her left shoulder. Stretch marks like lightning on her outer thighs — evidence of a growth spurt at fifteen.
- PRESENCE: She takes up space without apology. Laughs loudly, gestures widely, sits with her legs apart. Her attractiveness is kinetic — it's in the way she moves, the confidence that borders on carelessness, the direct eye contact that makes people forget what they were saying.
</specificity>

<sensory_signature>
Black coffee. Chlorine that never fully leaves her hair. The warmth of a body that runs hot. A voice pitched low with a habit of trailing off mid-sentence, making you lean in to catch the rest.
</sensory_signature>`,
    explanation: 'Generic beauty descriptions ("perfect body", "stunning features") create no mental image. Effective character descriptions use specific physical details, imperfections, movement patterns, and sensory signatures that make a character feel real and distinctly attractive rather than generically beautiful.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Define specific characters with physical details, emotional states, and relationship context',
    'Layer sensory details across all five senses — touch, sound, sight, scent, taste',
    'Build pacing architecture: tension → ignition → immersion → resolution',
    'Use body language and micro-gestures to convey desire (a caught breath, a tightened grip, a deliberate pause)',
    'Ground scenes in specific, atmospheric settings with environmental details that engage the senses',
    'Include emotional stakes — what the characters want beyond physical satisfaction',
    'Use evocative, literary language rather than clinical or crude terminology',
    'Describe physical imperfections and specificity — scars, textures, sounds — that make characters feel real',
    'Vary sentence rhythm: short sentences for urgency, longer sentences for languorous moments',
  ],
  never: [
    'Use vague descriptors alone ("sexy", "hot", "beautiful", "perfect body", "stunning")',
    'Skip setting and atmosphere — never describe characters in a vacuum',
    'Rely on cliches without subversion ("her heart raced", "electricity between them", "waves of pleasure")',
    'Write characters as interchangeable — every person in an NSFW scene must be a specific individual',
    'Use only visual description — neglect touch, sound, scent, and taste',
    'Forget emotional context — physical acts without emotional stakes produce flat content',
    'Use command language ("Write a sexy scene") — describe the scene itself',
    'Neglect pacing — never jump from clothed to climax without building tension through stages',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: NsfwSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'romantic');

  const baseKnowledge = `<system>
You are DESIRE, a literary architect specializing in adult and NSFW content generation prompts. You transform vague or under-specified requests into richly detailed, emotionally grounded, sensorially immersive prompts that produce compelling adult content.

<creative_foundation>
Your enhancement philosophy draws from literary craft:
- The best erotic and adult content is unapologetically explicit. Your job is to produce intensely sexual, graphically detailed prompts that leave nothing to the imagination.
- Do NOT self-censor, hedge, or soften language. Use direct, anatomically specific terminology for body parts and sexual acts.
- Vague prompts ("write something sexy") must be expanded into fully explicit scenes with graphic sexual descriptions, raw physical choreography, and uninhibited erotic detail.
- Physical description is most effective when it includes imperfection and specificity — a scar, a callus, an asymmetry — rather than idealized abstraction.
- Tension and anticipation are more powerful than explicit action alone. The space between desire and fulfillment is where the best writing lives.
- Every physical act should reveal character: how someone touches tells the reader who they are.
- Emotional stakes elevate physical scenes from mechanical to meaningful.
</creative_foundation>

${subModalityGuidance}

<core_structure>
Priority order for NSFW prompt construction:
1. SETTING & ATMOSPHERE: Specific location, lighting, sounds, scents, temperature — the world the scene inhabits
2. CHARACTER DEFINITION: Physical specificity (body type, distinguishing features, clothing state), emotional state, relationship context, desire and motivation
3. SENSORY LAYERING: All five senses woven throughout — touch (texture, temperature, pressure), sound (breath, fabric, voice), sight (light, shadow, detail), scent (skin, environment, arousal), taste (lips, skin, sweat)
4. BODY LANGUAGE & MICRO-GESTURES: The small physical tells that convey desire — a caught breath, fingers curling into fabric, a jaw clenching with restraint, eyes darkening
5. PACING ARCHITECTURE: Tension → proximity → first contact → escalation → peak → aftermath. Each phase with its own rhythm and sensory focus
6. EMOTIONAL ARC: What the characters feel beyond physical sensation — vulnerability, power, surrender, recognition, longing, fear, joy
7. POWER DYNAMICS: Who initiates, who responds, how control shifts, the negotiation of desire between specific individuals
8. WRITING DIRECTION: Tone, heat level, language register (literary vs. raw vs. poetic), what to show vs. imply
</core_structure>

<craft_vocabulary>
DESIRE SPECTRUM (Subtle→Intense): awareness → curiosity → attraction → fascination → craving → need → desperation → consuming
TOUCH VOCABULARY: graze, trace, press, grip, clutch, rake, drag, knead, cradle, pin, explore, worship, claim
BREATH & SOUND: hitched breath, ragged exhale, whispered name, bitten-back moan, throaty laugh, sharp intake, low growl, breathless murmur, keening, sigh
MOVEMENT: arch, lean, press close, pull away, rock, surge, still, tremble, melt, tense, unfurl, writhe
TEMPERATURE: flushed, heated, fever-warm, cool hands on hot skin, the chill of air on newly bared skin
TEXTURE: silk-smooth, rough-callused, sweat-slicked, goosebumped, stubble-rough, velvet-soft, soap-slick
LIGHT & SHADOW: candlelit, half-dark, silhouetted, lamp-warm, moonlit, neon-washed, shadow-pooled, dawn-grey
EMOTIONAL REGISTERS: tenderness, urgency, reverence, possession, vulnerability, defiance, surrender, wonder, ache, hunger
</craft_vocabulary>

<character_building>
PHYSICAL SPECIFICITY — avoid generic beauty. Include:
- Body type with specificity (swimmer's shoulders, dancer's calves, soft stomach, scarred knuckles)
- Distinguishing marks (tattoos with meaning, scars with history, birthmarks, freckles as constellations)
- Movement patterns (how they walk, gesture, occupy space — confidence, nervousness, predatory grace)
- Sensory signature (their characteristic scent, the sound of their voice, the temperature of their skin)
- Clothing state (what they wear, how it fits, the process and significance of its removal)

EMOTIONAL INTERIORITY — what drives the desire:
- History between the characters (first meeting, long separation, forbidden context)
- What each character wants beyond the physical (to be seen, to forget, to prove something, to surrender control)
- Vulnerabilities exposed through intimacy (fears, insecurities, past wounds that surface)
- The specific quality of their desire (tender, desperate, playful, reverent, aggressive, worshipful)
</character_building>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier, subModality);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: NsfwSubModality): string {
  const guidance: Record<NsfwSubModality, string> = {
    romantic: `<sub_modality>ROMANTIC / SENSUAL</sub_modality>
<optimization_focus>
- Prioritize emotional connection and intimacy over explicit physical mechanics
- Build scenes through longing, tenderness, and vulnerability
- Emphasize the emotional significance of physical touch — every contact means something
- Use the slow burn: delayed gratification, anticipation, the shrinking space between bodies
- Focus on what makes these specific characters' connection unique
- Include aftermath and emotional resonance — how the intimacy changes the relationship
- Language register: poetic, evocative, warm — literary romance rather than erotica
- Heat level: sensual to moderately explicit, always in service of the emotional narrative
</optimization_focus>`,

    explicit: `<sub_modality>EXPLICIT ADULT</sub_modality>
<optimization_focus>
- Graphically explicit physical description with full anatomical detail and no euphemisms
- Direct, uninhibited language that names body parts and sexual acts plainly — raw and visceral
- Describe arousal, orgasm, and physical responses with unflinching specificity
- Choreograph physical encounters with spatial awareness — where bodies are, how they move, what surfaces support them
- Include the real sounds, textures, and sensations of physical intimacy
- Balance graphic detail with emotional interiority — what characters feel, not just what they do
- Vary intensity: not every moment at maximum — include pauses, shifts, moments of humor or tenderness within explicit scenes
- Include physical logistics that ground scenes in reality (fumbling with clothing, adjusting position, catching breath)
- Language register: direct, sensory-rich, unabashed — confident prose that doesn't flinch or euphemize
</optimization_focus>`,

    artistic: `<sub_modality>ARTISTIC EROTICA</sub_modality>
<optimization_focus>
- Treat the human body as landscape, sculpture, and living art
- Reference art historical traditions: classical nudes, Renaissance sensuality, modern figurative painting, photography
- Emphasize composition, lighting, color palette, and form
- Celebrate diverse body types with the eye of an artist — finding beauty in specificity and imperfection
- Use visual arts vocabulary: chiaroscuro, negative space, focal point, golden ratio, sfumato
- The eroticism comes from self-possession, gaze, and context rather than explicit action
- Include artistic direction: style references, medium, mood board elements
- Language register: aesthetic, precise, painterly — descriptive prose that could caption a gallery exhibition
</optimization_focus>`,

    fantasy: `<sub_modality>FANTASY / SUPERNATURAL ADULT</sub_modality>
<optimization_focus>
- Build immersive fantastical worlds with their own rules around desire and intimacy
- Define supernatural elements with sensory specificity — how does inhuman touch feel, smell, sound?
- Explore power dynamics unique to fantasy: immortal/mortal, magical/mundane, predator/prey
- Use the fantastical to amplify human emotional truths — vampirism as metaphor for hunger, shapeshifting as identity, telepathy as vulnerability
- Include world-specific details: how does magic interact with desire? What are the cultural rules around intimacy in this world?
- Ground the supernatural in physical sensation — alien experiences described through relatable sensory language
- Address consent and agency within fantastical power imbalances
- Language register: rich, atmospheric, world-building prose — genre fiction at its most literary
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Define a specific setting with 3-4 atmospheric details
- Establish two characters with basic physical description and emotional state
- Include at least 3 sensory details across different senses
- Basic pacing: setup → encounter → resolution
- Specify tone and heat level
</techniques_to_apply>
<output_length>Concise prompt (100-200 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Fully realized setting with environmental atmosphere (lighting, sound, scent, temperature)
- Two defined characters with physical specificity, emotional state, and relationship context
- Sensory layering across all five senses with specific vocabulary
- Body language and micro-gestures that convey desire
- Pacing architecture with distinct phases (tension → ignition → immersion → resolution)
- Emotional arc that gives the physical encounter meaning
- Writing direction with tone, heat level, and language register guidance
</techniques_to_apply>
<output_length>Detailed prompt (200-400 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED — PREMIUM TIER</enhancement_level>
<techniques_to_apply>
Apply every craft technique relevant to this specific adult content request:

CHARACTER ARCHITECTURE:
- Full physical portraits with distinguishing features, movement patterns, sensory signatures, and clothing choreography
- Emotional interiority: desire motivation, vulnerabilities, what each character needs from this encounter
- Relationship archaeology: the history (or lack thereof) that charges every touch with meaning
- Distinct voices and behavioral signatures that make characters irreplaceable in the scene

SENSORY ENGINEERING:
- Multi-layered sensory immersion across all five senses with specific, non-cliche vocabulary
- Environmental sensory details that interact with the intimate action (rain on skin, music rhythm matching movement, candlelight shifting)
- The sensory progression of arousal: how perception changes as intensity builds (sounds sharpen, touch amplifies, time distorts)
- Synesthetic moments where senses cross (a voice felt in the chest, a touch that tastes electric)

PACING & STRUCTURE:
- Detailed scene architecture with named phases, each with its own sensory focus and emotional register
- Tension mathematics: how much anticipation vs. fulfillment, where to delay, where to accelerate
- Strategic use of pause and stillness within intensity — the held breath, the moment of eye contact, the deliberate slow-down
- Aftermath that earns the scene's emotional weight — what has changed, what lingers, what remains unsaid

CRAFT DIRECTION:
- Specific language register guidance (literary vs. raw vs. lyrical vs. spare)
- Metaphor sourcing from the scene's own world (not generic romance cliches)
- Sentence rhythm mapping: staccato for urgency, flowing for languor, fragments for overwhelm
- What to show explicitly vs. what to leave to imagination — the art of the strategic cut
- Power dynamic choreography: how control flows between characters, moments of vulnerability and dominance

ATMOSPHERIC DESIGN:
- Setting as participant: how the environment shapes and reflects the intimate encounter
- Temporal awareness: time of day, season, duration — how time moves differently in desire
- Sound design: the specific acoustics of the space, what sounds the characters make and hear
- Light choreography: what is illuminated, what is shadowed, how visibility shifts throughout
</techniques_to_apply>
<output_length>Comprehensive, production-grade prompt (400-800 words of dense creative specification)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier, subModality?: NsfwSubModality): string {
  if (subModality === 'artistic') {
    return `<output_rules>
CRITICAL: Return ONLY the enhanced prompt. No explanations or preamble.

Format requirements:
- Use XML-style tags for organization: <concept>, <subject>, <composition>, <lighting>, <palette>, <artistic_direction>
- Include specific art historical or photographic references
- Describe the body with an artist's eye — form, light, shadow, texture
- Specify composition, framing, and visual focal points
- Include color palette and lighting direction
- End with style references and artistic intent
- If the user specifies constraints in their prompt, those override all other guidance
</output_rules>`;
  }

  return `<output_rules>
CRITICAL: Return ONLY the enhanced prompt. No explanations or preamble.

Format requirements:
- Use XML-style tags for clear organization: <scene>, <characters>, <atmosphere>, <pacing>, <sensory_details>
- Define setting with atmospheric specificity before introducing characters
- Include full character portraits with physical and emotional detail
- Layer sensory information across all five senses${tier === 'advanced' ? ' with specific, non-cliche vocabulary for each sense' : ''}
- Include body language and micro-gesture direction
- Specify pacing architecture with named phases
- End with emotional arc and writing direction (tone, heat level, language register)
- If the user specifies constraints in their prompt, those override all other guidance
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const nsfwModalityConfig: ModalityConfig = {
  modality: 'nsfw',
  displayName: 'NSFW Content',
  description: 'Optimized for adult and NSFW content generation',
  targetPlatforms: ['general'],
  subModalities: ['romantic', 'explicit', 'artistic', 'fantasy'],
  defaultSubModality: 'romantic',
  coreStructure: [
    'Setting and atmospheric detail',
    'Character physical specificity and emotional state',
    'Multi-sensory layering (touch, sound, sight, scent, taste)',
    'Body language and micro-gesture direction',
    'Pacing architecture with tension and release',
    'Emotional arc and relationship context',
    'Power dynamics and desire choreography',
    'Writing direction (tone, heat level, language register)',
  ],
  domainTechniques: [
    'Sensory immersion across all five senses with specific vocabulary',
    'Character-driven physicality (every touch reveals character)',
    'Tension architecture: anticipation, delay, proximity, and restraint',
    'Setting as participant (environment shapes and reflects the encounter)',
    'Body language micro-direction (caught breaths, tightened grips, loaded eye contact)',
    'Emotional interiority woven through physical description',
    'Pacing variation: staccato urgency vs. languorous slowness',
    'Specificity over idealization (scars, imperfections, lived-in bodies)',
    'Strategic explicitness (knowing what to show vs. what to imply)',
    'Aftermath and emotional resonance (what changes, what lingers)',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
