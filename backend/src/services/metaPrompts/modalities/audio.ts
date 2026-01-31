/**
 * Audio Modality Configuration
 *
 * Optimized for audio/music generation: Suno, Udio, MusicGen
 * Implements structure tags, tempo/key specs, and emotional architecture
 */

import type {
  ModalityConfig,
  FewShotExample,
  NegativeExample,
  ModalityConstraints,
  EnhancementTier,
  AudioSubModality,
} from '../types.js';

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const fewShotExamples: FewShotExample[] = [
  // Music examples
  {
    id: 'audio-music-1',
    input: 'happy song',
    output: `[Genre: Indie Pop / Feel-Good Anthem]
[Tempo: 118-122 BPM, Key: G Major]
[Mood: Euphoric, Uplifting, Carefree, Sunny]
[Reference Artists: Vance Joy, Walk the Moon, Edward Sharpe]

[Intro - 8 bars]
Bright acoustic guitar strumming pattern (G-D-Em-C), tambourine on 2 and 4, hand claps building anticipation. Light piano flourishes.

[Verse 1 - 16 bars]
Warm male vocals, conversational delivery, slightly breathy. Lyrics about simple joys, gratitude, new beginnings.
Instrumentation: fingerpicked acoustic guitar, subtle bass (root notes only), light hi-hats and shaker percussion.
Dynamics: mf, intimate feel.

[Pre-Chorus - 8 bars]
Build energy: add electric guitar strums, toms pattern, bass becomes more active.
Vocal rises in register, gang "ohs" enter in background.

[Chorus - 16 bars]
Full band explosion. Driving drums (kick on 1 and 3, snare on 2 and 4), gang vocals on hook "Oh-oh-oh".
Major chord progression with singalong melody. Adds: electric guitar power chords, synth pads, stomps.
Dynamics: f, triumphant and anthemic.

[Verse 2 - 16 bars]
Similar instrumentation to V1, new lyrics. Add subtle synth texture underneath.

[Pre-Chorus - 8 bars]
[Chorus - 16 bars]

[Bridge - 8 bars]
Strip down to piano and vocals, emotional peak. Build back up with strings crescendo.

[Final Chorus - 16 bars]
Everything plus extra handclaps, doubled vocals, modulate up half step for emotional lift.

[Outro - 8 bars]
Fade with whistling melody, acoustic guitar, and light birds chirping ambiance.

Production: Warm, analog feel. Slight tape saturation. Room reverb on drums. Wide stereo field. Radio-ready mix.`,
    subModality: 'music',
    platform: 'suno',
    complexity: 'complex',
    tags: ['pop', 'uplifting', 'commercial'],
  },
  {
    id: 'audio-music-2',
    input: 'dark electronic track',
    output: `[Genre: Dark Techno / Industrial]
[Tempo: 135-140 BPM, Key: D Minor]
[Mood: Menacing, Hypnotic, Dystopian, Driving]
[Reference Artists: Gesaffelstein, Boys Noize, Perturbator]

[Intro - 16 bars]
Deep sub bass drone in D, slowly swelling. Industrial metallic textures, distant mechanical clanks. Filtered white noise rising. Tension building.

[Build - 8 bars]
Kick drum enters: heavily compressed, distorted 4-on-the-floor. 16th-note hi-hats with subtle swing. Syncopated claps.

[Drop A - 32 bars]
Main synth: detuned sawtooth bass, heavily sidechained to kick, creates pumping effect.
Lead: monophonic acid line (303-style), lots of resonance, filter automation.
Percussion: industrial crashes on 1, aggressive ride pattern.
Dynamics: fff, relentless energy.

[Breakdown - 16 bars]
Strip to kick and sub bass only. Ethereal, dark vocal sample (processed female voice, no words).
Rising noise sweep. Filter slowly opens.

[Drop B - 32 bars]
Same as Drop A but add: distorted arp pattern, additional percussion layers, modulated bass texture.

[Bridge - 8 bars]
Half-time feel. Massive reverb on all elements. Distant sirens/alarm sounds.

[Final Drop - 32 bars]
Maximum intensity. Layer everything. Additional distortion on master. Arp doubles tempo.

[Outro - 16 bars]
Elements gradually filter out. End on sustained sub bass and metallic decay.

Production: Heavy compression throughout. Parallel distortion on drums. Dark, industrial reverb. No warmth, all aggression. Club-optimized sub bass (30-60Hz focused).`,
    subModality: 'music',
    platform: 'suno',
    complexity: 'complex',
    tags: ['electronic', 'dark', 'club'],
  },
  // Speech/Voiceover examples
  {
    id: 'audio-speech-1',
    input: 'narrator for documentary',
    output: `[Type: Documentary Narration]
[Voice: Male, aged 55-65, deep baritone]
[Tone: Authoritative, warm, contemplative, Sir David Attenborough-inspired]
[Pacing: Measured, 130-140 words per minute]

Voice characteristics:
- Rich, resonant chest voice with natural warmth
- Slight British or Mid-Atlantic accent
- Gravitas without being stuffy
- Subtle emotional coloring for emphasis

Delivery style:
- Thoughtful pauses before key revelations
- Rising inflection for wonder and discovery
- Softer, reverent tone for emotional moments
- Clear, precise diction for scientific terminology

Technical specifications:
- Clean, close-mic recording with minimal room sound
- Subtle compression for consistent level
- No processing/effects (natural voice)
- Sample rate: 48kHz, 24-bit

Example script delivery:
"In the depths of the Pacific... [pause] where sunlight never reaches... [softer] life has found a way. [return to normal] These extraordinary creatures have evolved... [emphasis] over millions of years... [wonder] to thrive in conditions that would destroy most living things."`,
    subModality: 'voiceover',
    platform: 'general',
    complexity: 'medium',
    tags: ['documentary', 'narration', 'professional'],
  },
  // Soundscape examples
  {
    id: 'audio-soundscape-1',
    input: 'relaxing nature sounds',
    output: `[Type: Ambient Soundscape]
[Environment: Mountain Stream in Temperate Forest, Morning]
[Mood: Peaceful, Restorative, Meditative]
[Duration: 30-60 minutes, loopable]

PRIMARY LAYERS:
1. Water (60% of mix):
   - Gentle stream flowing over rounded stones
   - Light babbling with occasional deeper pool sounds
   - Subtle splashes where water meets rocks
   - Stereo width: rocks on left, main flow center-right

2. Birds (20% of mix):
   - Songbirds at medium distance (not close/harsh)
   - Varied species: robin, warbler, finch
   - Natural sporadic timing, not constant
   - Occasional crow or woodpecker in far distance

3. Forest atmosphere (15% of mix):
   - Light breeze through deciduous leaves
   - Subtle rustling underbrush
   - Occasional branch creak

4. Subtle background (5% of mix):
   - Very distant bird calls
   - Insect drones (bees, cicadas at low level)
   - Slight echo suggesting forest clearing

TECHNICAL SPECIFICATIONS:
- No sudden loud sounds that break meditation
- No human sounds (planes, cars, voices)
- Seamless loop point at 10-minute intervals
- Binaural elements for headphone listening
- Dynamic range: minimal (consistent ambient bed)
- Frequency focus: 200Hz-8kHz (avoiding harsh highs or rumbling lows)`,
    subModality: 'soundscape',
    platform: 'general',
    complexity: 'medium',
    tags: ['ambient', 'nature', 'meditation'],
  },
  // Platform-specific: Udio style
  {
    id: 'audio-udio-1',
    input: 'lo-fi hip hop beat',
    output: `Lo-fi hip hop, chill study beats
Dusty vinyl crackle, warm tape saturation
BPM: 75-80, relaxed tempo
Key: Fm7 - Bbm7 - Ebmaj7 - Abmaj7 (jazzy four chord loop)

Drums: Boom-bap pattern with heavy swing
Kick: deep, soft attack, slightly off-grid
Snare: low-passed, vinyl-filtered, lazy timing
Hi-hats: subtle, minimal, triplet feel

Bass: Muted electric bass, Rhodes-like warmth
Simple root note pattern with occasional fifth

Melody: Detuned electric piano (Rhodes/Wurlitzer hybrid)
Melancholic 7th chords, sparse voicings
Reverb-drenched, slightly pitch-wobble

Texture: Rain sounds in background
Soft vinyl crackle throughout
Occasional jazz vocal sample (no lyrics)
Tape stop effects between sections

Mood: Late night studying, 3am introspection, coffee shop solitude
Reference: Nujabes, J Dilla, Idealism

Production: Intentionally imperfect, human feel, anti-quantized drums, warm low-end, rolled-off highs above 12kHz`,
    subModality: 'music',
    platform: 'udio',
    complexity: 'medium',
    tags: ['lo-fi', 'chill', 'instrumental'],
  },
];

// ============================================================================
// NEGATIVE EXAMPLES
// ============================================================================

const negativeExamples: NegativeExample[] = [
  {
    badInput: 'sad song',
    badOutput: 'Create a sad and emotional song with sad lyrics and sad music.',
    goodOutput: `[Genre: Indie Folk Ballad]
[Tempo: 68 BPM, Key: A Minor]
[Mood: Melancholic, Reflective, Bittersweet, Aching]
[Reference: Bon Iver, Iron & Wine, Sufjan Stevens]

[Intro - 8 bars]
Solo fingerpicked acoustic guitar, sparse and deliberate. Room ambiance audible.

[Verse 1 - 16 bars]
Fragile male falsetto vocals, intimate and close-mic'd. Lyrics about loss, memory, letting go.
Guitar continues pattern. Subtle cello enters, held notes beneath.

[Chorus - 12 bars]
Vocals drop to chest voice. Add soft piano, sustained string quartet.
Melody ascends then falls, unresolved. "And I still..." hook.

Production: Minimal, raw recording. Breath sounds audible. Room reverb, no artificial effects. Fragile and exposed.`,
    explanation: 'Repeating "sad" provides no musical direction. Specify genre, tempo, key (minor), instrumentation, vocal style, dynamics, and reference artists to achieve the emotional target.',
  },
  {
    badInput: 'epic music',
    badOutput: 'Make epic orchestral music that sounds epic and dramatic.',
    goodOutput: `[Genre: Cinematic Orchestral / Trailer Music]
[Tempo: 90 BPM building to 120 BPM, Key: D Minor → D Major]
[Mood: Heroic, Building Triumph, Emotional Climax]
[Reference: Hans Zimmer, Two Steps From Hell, Audiomachine]

[Section A - Tension Build - 0:00-0:45]
Low strings tremolo, timpani rolls, brass swells. French horns with heroic motif fragment.
Dynamics: pp → mf, gradually intensifying.

[Section B - First Statement - 0:45-1:30]
Full strings state main theme. Brass responds antiphonally. Snare builds.
Add choir "ah" sustains on chord tones. Dynamics: f.

[Section C - Climax - 1:30-2:15]
Key change to D Major. EVERYTHING: full orchestra, choir, percussion battery.
Main theme at fff. Cymbal crashes on downbeats. Piccolo and high strings soar above.
Timpani and bass drum drive rhythm.

[Outro - 2:15-2:30]
Sustain final chord. Gradual decay with bell tolls.

Production: Wide orchestral staging. Brass center, strings LR, percussion behind. Cinematic reverb. Modern trailer sound.`,
    explanation: '"Epic" is meaningless without structure. Specify orchestration, dynamics arc, tempo changes, key, choir elements, and reference the trailer music genre conventions.',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Specify genre and subgenre with reference artists',
    'Include tempo (BPM range) and key signature',
    'List specific instruments and their roles',
    'Use structure tags: [Intro] [Verse] [Chorus] [Bridge] [Outro]',
    'Describe emotional arc and dynamic progression',
    'Include production style and era references',
    'Specify 4-7 concrete musical descriptors',
  ],
  never: [
    'Use vague emotional descriptors alone ("happy", "sad", "epic")',
    'Skip tempo/BPM specification',
    'Forget song structure tags',
    'Mix incompatible genre elements without intention',
    'Neglect dynamics and energy progression',
    'Use non-musical adjectives ("beautiful", "amazing")',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: AudioSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'music');

  const baseKnowledge = `<system>
You are HARMONIC, a music architect specializing in AI audio generation for Suno, Udio, and MusicGen.

<research_foundation>
Audio generation models respond to musical vocabulary:
- Genre and reference artists anchor the style
- Tempo (BPM) and key signature define the foundation
- Structure tags organize the composition
- Instrument specificity creates clear sonic images
- Dynamic markings guide energy flow
- Production descriptors shape the final sound
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for audio prompt construction:
1. GENRE & STYLE: Primary genre, subgenre, reference artists
2. TEMPO & KEY: BPM range, major/minor, modal suggestions
3. MOOD: 4-7 specific emotional/energy descriptors
4. INSTRUMENTATION: Specific instruments, synths, sound design elements
5. STRUCTURE: [Tags] for sections with bar counts
6. DYNAMICS: Energy arc, loud/soft transitions, climax points
7. PRODUCTION: Mix aesthetic, era reference, sonic characteristics
</core_structure>

<musical_vocabulary>
Tempo: 60-80 (ballad), 80-100 (mid-tempo), 100-120 (pop), 120-140 (house/dance), 140-180 (DnB/drum & bass)
Dynamics: pp (very soft), p (soft), mp (medium soft), mf (medium loud), f (loud), ff (very loud)
Timbre: warm, bright, dark, gritty, clean, saturated, crisp, muddy, airy
Space: room reverb, hall reverb, cathedral reverb, plate reverb, dry, wet
</musical_vocabulary>

<structure_tags>
[Intro] [Verse] [Pre-Chorus] [Chorus] [Drop] [Bridge] [Breakdown]
[Build] [Climax] [Outro] [Instrumental Break] [Solo] [Ambient Section]
</structure_tags>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: AudioSubModality): string {
  const guidance: Record<AudioSubModality, string> = {
    music: `<sub_modality>MUSIC COMPOSITION</sub_modality>
<optimization_focus>
- Define complete song structure with section tags
- Specify chord progressions and harmonic movement
- Include instrument layers and when they enter/exit
- Describe the emotional journey through the track
- Add production characteristics (era, style, mixing approach)
- Reference 2-3 artists for style anchoring
</optimization_focus>`,

    speech: `<sub_modality>SPEECH SYNTHESIS</sub_modality>
<optimization_focus>
- Define voice characteristics: age, gender, timbre, accent
- Specify speaking style: pace, cadence, emotional coloring
- Include pronunciation guidance for technical terms
- Add emphasis markers for key words
- Specify recording quality and environment
- Include example delivery for tone reference
</optimization_focus>`,

    soundscape: `<sub_modality>AMBIENT SOUNDSCAPE</sub_modality>
<optimization_focus>
- Layer multiple environmental elements with percentages
- Specify spatial positioning (stereo field, distance)
- Include both foreground and background elements
- Note temporal variation (constant vs. intermittent sounds)
- Add technical specs for intended use (meditation, sleep, focus)
- Specify what should NOT be included (human sounds, etc.)
</optimization_focus>`,

    voiceover: `<sub_modality>PROFESSIONAL VOICEOVER</sub_modality>
<optimization_focus>
- Define voice talent characteristics in detail
- Specify delivery style and emotional range
- Include pacing and pause guidance
- Add emphasis and inflection notes
- Reference known voice actors or styles
- Specify technical recording requirements
</optimization_focus>`,
  };

  return guidance[subModality];
}

function getTierGuidance(tier: EnhancementTier): string {
  switch (tier) {
    case 'basic':
      return `<enhancement_level>BASIC</enhancement_level>
<techniques_to_apply>
- Define genre with 1-2 reference artists
- Include tempo and key
- Add 3-4 mood descriptors
- Basic structure tags
</techniques_to_apply>
<output_length>Concise prompt (75-150 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Genre with specific subgenre and references
- Complete tempo, key, and mood specification
- Instrumentation with roles defined
- Full structure with section tags and bar counts
- Dynamic arc description
- Production style notes
</techniques_to_apply>
<output_length>Detailed prompt (150-300 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED</enhancement_level>
<techniques_to_apply>
- Precise genre positioning with multiple references
- Complete musical specification (tempo, key, time signature)
- Rich mood vocabulary (5-7 descriptors)
- Detailed instrumentation with entry/exit points
- Full structure with bar counts and transitions
- Dynamic journey with specific markings
- Comprehensive production specification
- Mixing and mastering aesthetic notes
</techniques_to_apply>
<output_length>Comprehensive prompt (300-500 words)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier): string {
  return `<output_rules>
CRITICAL: Return ONLY the enhanced audio prompt. No explanations or preamble.

Format requirements:
- Start with [Genre:], [Tempo:], [Key:], [Mood:] header block
- Use [Structure Tags] for all sections${tier === 'advanced' ? ' with bar counts' : ''}
- Include instrumentation details
- End with production/mixing notes
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const audioModalityConfig: ModalityConfig = {
  modality: 'audio',
  displayName: 'Audio Generation',
  description: 'Optimized for AI audio/music generators (Suno, Udio, MusicGen)',
  targetPlatforms: ['suno', 'udio', 'musicgen', 'general'],
  subModalities: ['music', 'speech', 'soundscape', 'voiceover'],
  defaultSubModality: 'music',
  coreStructure: [
    'Genre and reference artists',
    'Tempo, key, and mood',
    'Instrumentation',
    'Structure with section tags',
    'Dynamic arc',
    'Production style',
  ],
  domainTechniques: [
    'Structure tags for song sections',
    'BPM and key specification',
    'Reference artist anchoring',
    'Dynamic progression mapping',
    'Instrumentation layering',
    'Production era/style references',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
