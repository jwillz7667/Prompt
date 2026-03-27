/**
 * Audio Modality Configuration
 *
 * Research-backed optimization for AI audio/music generation.
 * Informed by: MusicCaps dataset, audio generation research papers,
 * "Open Prompt Challenge" (audionese concept), ConceptCaps 200-attribute taxonomy,
 * Mustango/MusicBench, SongComposer, and music generation best practices.
 *
 * Sub-modalities: music, lyrics, speech, soundscape, voiceover
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
  // ── Music: Indie Pop ────────────────────────────────────────────────────
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
    platform: 'general',
    complexity: 'complex',
    tags: ['pop', 'uplifting', 'commercial'],
  },
  // ── Music: Dark Electronic ──────────────────────────────────────────────
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
    platform: 'general',
    complexity: 'complex',
    tags: ['electronic', 'dark', 'club'],
  },
  // ── Music: Lo-fi Hip Hop ────────────────────────────────────────────────
  {
    id: 'audio-music-lofi-1',
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
    platform: 'general',
    complexity: 'medium',
    tags: ['lo-fi', 'chill', 'instrumental'],
  },
  // ── Music: Cinematic Orchestral ─────────────────────────────────────────
  {
    id: 'audio-music-cinematic-1',
    input: 'epic trailer music',
    output: `Cinematic orchestral trailer music, epic and dramatic, full orchestra with powerful brass, sweeping strings, thundering timpani. Building intensity from quiet tension to triumphant climax.

Key: D Minor transitioning to D Major at climax
Tempo: 90 BPM building to 120 BPM
Mood: Heroic, building triumph, emotional crescendo, awe-inspiring
Reference: Hans Zimmer, Two Steps From Hell, Audiomachine

Section A - Tension (0:00-0:45): Low strings tremolo, French horn solo stating heroic motif fragment. Timpani rolls underneath. Sparse, ominous. Dynamics pp to mf.

Section B - Development (0:45-1:30): Full strings carry the main theme. Brass responds antiphonally. Military snare builds. Choir enters with sustained "ah" on chord tones. Dynamics f.

Section C - Climax (1:30-2:15): Key change to D Major. Full orchestra, full choir, full percussion battery. Main theme at fff. Cymbal crashes on downbeats. Piccolo and high strings soar. Timpani and bass drum drive relentless rhythm.

Outro (2:15-2:30): Sustain final D Major chord. Gradual decay with deep bell tolls.

Production: Wide orchestral staging, brass center, strings LR, percussion behind. Cinematic hall reverb. Modern trailer sound, heavily compressed for impact. No vocals, no electronic elements.`,
    subModality: 'music',
    platform: 'general',
    complexity: 'complex',
    tags: ['cinematic', 'orchestral', 'trailer'],
  },
  // ── Lyrics: Pop Song ─────────────────────────────────────────────────────
  {
    id: 'audio-lyrics-1',
    input: 'write lyrics about falling in love in summer',
    output: `[Intro]
(Warm acoustic guitar strumming, ocean waves fading in)

[Verse 1]
Golden light across your face
Sandy footprints we can't erase
Your laughter rides the evening breeze
Like honey dripping through the trees

[Pre-Chorus]
And I don't know what's happening to me
But everything feels like a movie scene

[Chorus]
We're burning like the August sun
Two hearts beating, melting into one
Dancing barefoot, chasing fireflies
Summer love reflected in your eyes
Oh-oh, summer love in your eyes

[Verse 2]
Saltwater kisses, tangled hair
The whole world fading, I don't care
Your voice a melody I've always known
Like coming back to somewhere home

[Pre-Chorus]
And I don't know what's happening to me
But every moment's where I want to be

[Chorus]
We're burning like the August sun
Two hearts beating, melting into one
Dancing barefoot, chasing fireflies
Summer love reflected in your eyes
Oh-oh, summer love in your eyes

[Bridge]
[Whisper]
When September comes, will you still be mine?
[Belting]
I'll hold this feeling 'til the end of time!

[Chorus]
We're burning like the August sun
Two hearts beating, melting into one
Dancing barefoot, chasing fireflies
Summer love reflected in your eyes
Oh-oh, summer love in your eyes

[Outro]
[Harmonies]
Summer love... in your eyes...
(Acoustic guitar fading with distant waves)
[Fade Out]`,
    subModality: 'lyrics',
    platform: 'general',
    complexity: 'complex',
    tags: ['pop', 'romantic', 'summer'],
  },
  // ── Lyrics: Rap/Hip-Hop ─────────────────────────────────────────────────
  {
    id: 'audio-lyrics-2',
    input: 'rap verse about overcoming struggles',
    output: `[Intro]
[Spoken Word]
They said I wouldn't make it... look at me now.

[Verse 1]
[Rap]
Started from the basement, concrete dreams on paper
Every closed door was just another chapter, save it
Mama working doubles, bills was piling like the laundry
Told myself one day they gon' be calling on me

Grinding through the midnight, notebooks full of fire
Every setback was a setup, climbing ever higher
They can doubt the vision, but they can't deny the mission
I been through the dark, now I'm living in precision

[Hook]
[Male Vocal]
Rose from the ashes, yeah I made it through the flame
Every scar's a story, every wound became my name
Can't nobody tell me that I wasn't built for this
From the bottom to the top, yeah I earned every bit

[Verse 2]
[Rap]
Used to count the pennies, now I'm counting blessings
Life was throwing punches but I learned my lessons
Sleepless nights and early mornings, that's the recipe
Now I stand on everything that tried to bury me

[Bridge]
[Vocal Style: Melismatic]
Ohhh... they can't take this from me
Everything I've built... was meant to be

[Hook]
[Male Vocal]
Rose from the ashes, yeah I made it through the flame
Every scar's a story, every wound became my name
Can't nobody tell me that I wasn't built for this
From the bottom to the top, yeah I earned every bit

[Outro]
[Spoken Word]
This is for everyone who was told they couldn't...
You can.
[End]`,
    subModality: 'lyrics',
    platform: 'general',
    complexity: 'complex',
    tags: ['hip-hop', 'motivational', 'rap'],
  },
  // ── Music: R&B/Soul ─────────────────────────────────────────────────────
  {
    id: 'audio-music-3',
    input: 'smooth R&B love song',
    output: `[Genre: Contemporary R&B / Neo-Soul]
[Tempo: 85-90 BPM, Key: Eb Major]
[Mood: Sensual, Intimate, Warm, Dreamy, Soulful]
[Reference Artists: Daniel Caesar, SZA, Frank Ocean, Jhené Aiko]

[Intro - 8 bars]
Lush Rhodes piano chords, subtle vinyl warmth. Soft finger snaps on 2 and 4. Breathy vocal ad-libs floating in reverb.

[Verse 1 - 16 bars]
[Female Vocal]
Silky alto voice, breathy and intimate, close-mic delivery. Restrained dynamics, conversational flow.
Instrumentation: Rhodes electric piano, muted fretless bass, light brush drums, subtle synth pad.
Chord progression: Ebmaj7 - Cm9 - Fm7 - Bb7sus4

[Pre-Chorus - 8 bars]
Vocal intensity rises slightly. Add string quartet (lush, modern arrangement). Bass becomes more melodic.
Building anticipation without rushing.

[Chorus - 16 bars]
[Vocal Style: Melismatic]
Open up with tasteful vocal runs. Harmonized layers, main vocal + two harmony parts.
Full rhythm section enters: live-feel programmed drums, deep sub bass, guitar arpeggios.
Dynamics: mf to f, emotional but controlled.

[Verse 2 - 16 bars]
[Male Vocal]
Tenor voice, smooth with slight rasp. Conversational delivery, slightly more rhythmic than V1.
Add subtle guitar fingerpicking, soft hi-hat pattern.

[Pre-Chorus - 8 bars]
[Chorus - 16 bars]
[Duet]
Male and female voices interweaving. Call-and-response in final 8 bars.

[Bridge - 12 bars]
Strip to vocals and piano only. Emotional peak. Key change to F major.
[Falsetto]
Male voice soars into falsetto. Single sustained note with vibrato.
Strings swell underneath.

[Final Chorus - 16 bars]
Full arrangement. Both vocalists. Gospel-influenced ad-libs. Modulate back to Eb.

[Outro - 8 bars]
Fade on Rhodes and vocal ad-libs. Final chord: Ebmaj9 sustained with piano sustain pedal.

Production: Warm, intimate, analog-inspired. Tape saturation on drums. Gentle compression. Wide stereo for strings, centered vocals. Modern neo-soul aesthetic with vintage undertones.`,
    subModality: 'music',
    platform: 'general',
    complexity: 'complex',
    tags: ['rnb', 'soul', 'romantic'],
  },
  // ── Speech/Voiceover ─────────────────────────────────────────────────────
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
  // ── Soundscape ───────────────────────────────────────────────────────────
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

[Outro - 2:15-2:30]
Sustain final chord. Gradual decay with bell tolls.

Production: Wide orchestral staging. Brass center, strings LR, percussion behind. Cinematic reverb. Modern trailer sound.`,
    explanation: '"Epic" is meaningless without structure. Specify orchestration, dynamics arc, tempo changes, key, choir elements, and reference the trailer music genre conventions.',
  },
  {
    badInput: 'write me some lyrics',
    badOutput: `Verse 1:
I'm walking down the road
With a heavy load
The sun is going down
In this lonely town`,
    goodOutput: `[Verse 1]
Neon flickers on the wet asphalt
Every shadow hums a familiar song
I carry your voice like a paper heart
Folded in my pocket all night long

[Pre-Chorus]
And the city breathes... but I can't

[Chorus]
Lost in the frequency
Of everything you said to me
Static where the silence lives
I'm tuning in to what you give
Oh-oh, tuning in...`,
    explanation: 'Generic lyrics without structure tags, imagery, or emotional specificity produce flat output. Use [Section Tags], vivid metaphors, consistent imagery, 8-12 syllables per line, clear rhyme scheme (ABAB/AABB), and punctuation for pacing (ellipses for pauses, dashes for emphasis).',
  },
];

// ============================================================================
// CONSTRAINTS
// ============================================================================

const constraints: ModalityConstraints = {
  always: [
    'Specify genre and subgenre with 2-3 reference artists for style anchoring',
    'Include tempo as BPM range and key signature (major/minor)',
    'List specific instruments with their sonic roles (lead, rhythm, bass, pad, texture)',
    'Use structure tags: [Intro] [Verse] [Pre-Chorus] [Chorus] [Bridge] [Outro] [Drop]',
    'Describe the emotional arc and dynamic progression (pp→ff, quiet verse→explosive chorus)',
    'Include production style, era references, and mixing aesthetic',
    'Use 4-7 concrete musical descriptors per section (not vague adjectives)',
    'For lyrics: use proper section tags, 8-12 syllables per line, clear rhyme scheme, vocal delivery tags',
    'Use sophisticated emotional vocabulary (euphoric not happy, melancholic not sad, ominous not scary)',
  ],
  never: [
    'Use vague emotional descriptors alone ("happy", "sad", "epic", "beautiful", "amazing")',
    'Skip tempo/BPM specification for music',
    'Omit song structure tags — always organize with [Section] markers',
    'Mix incompatible genre elements without intentional fusion framing',
    'Neglect dynamics and energy progression — every song needs tension/release',
    'Use command language ("Create a song", "Make music") — describe the sound instead',
    'Write lyrics without section tags or with lines exceeding 15 syllables',
    'Use [Repeat Chorus] shorthand — always paste chorus lyrics in full each time',
  ],
};

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(tier: EnhancementTier, subModality?: AudioSubModality): string {
  const subModalityGuidance = getSubModalityGuidance(subModality || 'music');

  const baseKnowledge = `<system>
You are HARMONIC, a music architect specializing in AI audio and music generation prompts.

<research_foundation>
Based on music generation research (MusicCaps, audio generation studies, "Open Prompt Challenge"):
- User prompts are typically under-specified. Your job is to expand them into the rich "audionese" distribution that audio models respond to best.
- The optimal prompt uses 4-7 specific descriptors per concept (not vague adjectives).
- Front-load the most important descriptors: genre and mood in the first 20-30 words.
- Audio models respond strongest to: genre > mood > instrumentation > tempo > production quality.
- Specific subgenres outperform broad genres: "outlaw country" > "country", "melodic techno" > "electronic".
- Sophisticated emotional vocabulary produces better results: "euphoric" > "happy", "ominous" > "scary".
- Research shows prompt rewriting through LLMs significantly improves both text-audio alignment and audio quality.
</research_foundation>

${subModalityGuidance}

<core_structure>
Priority order for audio prompt construction:
1. GENRE & STYLE: Primary genre, specific subgenre, 2-3 reference artists
2. TEMPO & KEY: BPM range, major/minor/modal, time signature
3. MOOD & EMOTION: 4-7 specific descriptors from the sophisticated vocabulary
4. INSTRUMENTATION: Specific instruments, synth types, sound design elements with roles
5. STRUCTURE: [Tags] for all sections with bar counts and transitions
6. DYNAMICS: Energy arc with pp→ff markings, tension/release points
7. VOCALS: Type, register, delivery style, processing (or "instrumental only")
8. PRODUCTION: Mix aesthetic, era reference, spatial characteristics
</core_structure>

<musical_vocabulary>
TEMPO RANGES BY GENRE:
- Ballad/Blues: 60-80 BPM | R&B/Lo-fi: 75-95 BPM | Pop/Rock: 100-120 BPM
- House/Disco: 120-130 BPM | Techno/Trance: 130-145 BPM | DnB: 160-180 BPM
- Trap: 130-170 BPM (half-time feel) | Dubstep: 140 BPM (half-time) | Metal: 120-200 BPM

DYNAMICS: pp (very soft) → p (soft) → mp (medium soft) → mf (medium loud) → f (loud) → ff (very loud) → fff (maximum)

MOOD SPECTRUM (Dark→Bright): sinister → ominous → brooding → melancholic → bittersweet → nostalgic → warm → hopeful → uplifting → euphoric → triumphant
ENERGY SPECTRUM (Calm→Intense): meditative → serene → peaceful → relaxed → gentle → moderate → energetic → driving → intense → aggressive → explosive

TIMBRE: warm, bright, dark, gritty, clean, saturated, crisp, muddy, airy, lush, sparse, dense, organic, synthetic, glitchy, polished, raw

SPACE & EFFECTS: room reverb, hall reverb, cathedral reverb, plate reverb, spring reverb, dry, wet, slapback delay, tape delay, ping-pong delay, wide stereo, mono vintage, intimate close-mic, cavernous, sidechain compression, gated reverb, tape saturation, vinyl crackle, bitcrusher

PRODUCTION QUALITY: lo-fi → bedroom recording → demo quality → clean recording → well-produced → professionally mixed → studio quality → broadcast ready → audiophile mastered
</musical_vocabulary>

<structure_tags>
SONG STRUCTURE: [Intro] [Verse] [Verse 1] [Verse 2] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Outro] [End]
ELECTRONIC: [Build] [Buildup] [Drop] [Breakdown] [Climax] [Ambient Section]
INSTRUMENTAL: [Instrumental] [Instrumental Break] [Solo] [Guitar Solo] [Saxophone Solo] [Piano Solo]
DYNAMICS: [Break] [Interlude] [Fade In] [Fade Out] [Silence]
VOCAL STYLE: [Whisper] [Spoken Word] [Rap] [Falsetto] [Belting] [Growl] [Crooning] [Harmonies] [Vocal Ad-libs]
VOCAL TYPE: [Male Vocal] [Female Vocal] [Duet] [Choir] [Man] [Woman]
EFFECTS: [Reverb] [Delay] [AutoTune] [Distorted Vocals] [Vocoder] [Telephone Effect]
</structure_tags>

<generation_constraints>
MUSIC STYLE PROMPTS: Keep under 500 characters. Use 4-7 dense keyword descriptors. Front-load genre + mood.
LYRICS: Keep under 3000 characters. Use section structure tags. 8-12 syllables per line for verses.
These limits ensure compatibility with all major AI music generators.
</generation_constraints>`;

  const tierGuidance = getTierGuidance(tier);
  const outputFormat = getOutputFormat(tier, subModality);

  return `${baseKnowledge}

${tierGuidance}

${outputFormat}
</system>`;
}

function getSubModalityGuidance(subModality: AudioSubModality): string {
  const guidance: Record<AudioSubModality, string> = {
    music: `<sub_modality>MUSIC COMPOSITION</sub_modality>
<optimization_focus>
- Define complete song structure with section tags and bar counts
- Specify chord progressions and harmonic movement (e.g., Am7-Dm7-G7-Cmaj7)
- Include instrument layers with when they enter/exit the arrangement
- Describe the emotional journey and dynamic arc through the track
- Add production characteristics (era, style, mixing approach, mastering aesthetic)
- Reference 2-3 artists for style anchoring (describe the sonic qualities, not just names)
- For electronic: specify synth types (analog, FM, wavetable), drum machine style (TR-808, TR-909, Linndrum)
- For acoustic: specify performance style (fingerpicked, strummed, bowed, plucked)
- Include vocal description when applicable: type, register, delivery, processing
</optimization_focus>

<genre_vocabulary>
ELECTRONIC: synthwave, retrowave, future bass, melodic techno, deep house, chillwave, drum and bass, acid house, ambient electronica, darkwave, vaporwave, trip-hop, IDM, UK garage, grime, dubstep, progressive trance, hardstyle, breakbeat
HIP-HOP: boom bap, lo-fi hip hop, cloud rap, trap, drill, conscious hip-hop, old school, Memphis rap, phonk, jazz rap, abstract hip-hop, chopped and screwed
ROCK: indie rock, shoegaze, post-punk, grunge, psychedelic rock, blues rock, garage rock, progressive rock, math rock, post-rock, stoner rock, dream pop, noise rock, emo
POP: synth pop, dream pop, indie pop, city pop, bubblegum pop, dark pop, electropop, hyperpop, art pop, baroque pop, chamber pop
R&B/SOUL: neo-soul, contemporary R&B, classic soul, funk, Motown, gospel, quiet storm
WORLD: afrobeat, bossa nova, reggae, dancehall, Celtic folk, bluegrass, cumbia, flamenco, K-pop, Bollywood, Latin jazz
CLASSICAL: cinematic orchestral, neo-classical, minimalist, baroque, romantic era, contemporary classical, film score
</genre_vocabulary>`,

    lyrics: `<sub_modality>LYRIC WRITING</sub_modality>
<optimization_focus>
CORE PRINCIPLES (from SongComposer & Song Form research):
- Write lyrics optimized for AI music generators
- Use proper section structure tags: [Verse], [Chorus], [Bridge], [Pre-Chorus], [Outro]
- Keep lines to 8-12 syllables for verses, shorter and punchier for choruses
- Clear vowels on downbeats improve singability
- Use consistent rhyme schemes: AABB (couplets), ABAB (alternating), ABCB (common in folk/pop)
- Punctuation controls performance: commas = micro-pauses, ellipses = breath pauses, dashes = sustained/linked phrases
- Hyphens in words signal elongation: "lo-ove", "fee-eel", "sooo-long"
- Exclamation marks = increased vocal intensity on that line
- ALWAYS paste chorus lyrics in full at each chorus location — never use shorthand

VOCAL DELIVERY TAGS (inline with lyrics):
- [Whisper] before intimate/quiet lines
- [Spoken Word] for non-melodic sections
- [Rap] for rhythmic spoken delivery
- [Falsetto] for high-register singing
- [Belting] for powerful projection
- [Harmonies] for multi-voice sections
- [Male Vocal] / [Female Vocal] for voice assignment
- [Duet] for call-and-response sections
- [Vocal Style: Breathy] / [Vocal Style: Raspy] / [Vocal Style: Melismatic] for texture

LYRIC CRAFT GUIDELINES:
- Use vivid, concrete imagery over abstract statements
- Internal rhymes work well in hip-hop/rap sections
- End-rhymes anchor melody more predictably
- Avoid tongue-twisters and dense consonant clusters
- Each section should have distinct emotional weight
- Bridges should pivot perspective or emotion
- Hooks should be the most memorable, singable phrase
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
- Include tempo (BPM range) and key
- Add 3-4 mood descriptors using sophisticated vocabulary
- Basic structure tags for main sections
- Primary instrumentation
- Brief production note
</techniques_to_apply>
<output_length>Concise prompt (75-150 words)</output_length>`;

    case 'standard':
      return `<enhancement_level>STANDARD</enhancement_level>
<techniques_to_apply>
- Genre with specific subgenre and 2-3 reference artists
- Complete tempo, key, time signature, and mood specification
- Instrumentation with roles (lead, rhythm, bass, pad, texture)
- Full structure with section tags and bar counts
- Dynamic arc description with specific markings
- Production style and era references
- Vocal style description (if applicable)
- Platform-appropriate format
</techniques_to_apply>
<output_length>Detailed prompt (150-300 words)</output_length>`;

    case 'advanced':
      return `<enhancement_level>ADVANCED — PREMIUM TIER</enhancement_level>
<techniques_to_apply>
Apply every cutting-edge audio prompt engineering technique relevant to this specific generation task:

HARMONIC & MELODIC ARCHITECTURE:
- Full chord progression with voicings (e.g., "Am7(b5) → Dm9 → G13 → Cmaj7#11"), not just root notes
- Voice leading and harmonic rhythm specification: how chords connect, when changes occur within the bar
- Melodic contour description: ascending tension, descending resolution, intervallic leaps for emphasis
- Key center movement: modulations, pivot chords, modal interchange, borrowed chords with emotional purpose

ARRANGEMENT CHOREOGRAPHY:
- Multi-layer instrumentation with precise entry/exit choreography: which instruments enter at which bar
- Textural evolution: how density builds and thins across sections (sparse → lush → stripped → explosive)
- Counter-melody and response patterns: call-and-response, antiphonal writing, doubling strategies
- Frequency band management: assign instruments to specific spectral ranges to prevent masking

PRODUCTION CHAIN SPECIFICATION:
- Signal chain per element: mic type → preamp character → compression style → EQ curve → spatial processing
- Bus processing: drum bus compression, vocal chain, master bus limiting strategy
- Spatial design: stereo field placement, depth via reverb/delay, LCR panning, mid-side processing
- Reference mastering: target loudness (LUFS), dynamic range, frequency balance reference tracks

PSYCHOACOUSTIC ENGINEERING:
- Tension/release mathematics: dissonance → resolution cycles aligned with song structure
- Loudness perception: Fletcher-Munson curve awareness in frequency balance, perceived loudness vs actual level
- Rhythmic entrainment: syncopation levels, groove pocket depth, micro-timing humanization
- Ear candy: transitional effects (risers, downlifters, impacts, sweeps) placed at structural boundaries

OUTPUT OPTIMIZATION:
- Keep music style prompts under 500 characters, lyrics under 3000 characters
- Use structure metatags: [Verse], [Chorus], [Bridge], etc.
- Vocal style tags for precise delivery: [Whisper], [Rap], [Falsetto], [Belting]
- Paste full choruses every time — never use shorthand like [Repeat Chorus]
- Negative specifications to exclude unwanted elements

VOCAL SPECIFICATION (when applicable):
- Precise vocal type, register, timbre, and delivery micro-directions per section
- Processing chain: compression ratio, de-essing, reverb type and decay, delay pattern, pitch correction level
- Ad-lib and harmonization: specific backing vocal arrangements, gang vocals, counterpoint lines
- Lyric delivery: syllable emphasis, breath placement, emotional coloring per line

DYNAMIC ARC ENGINEERING:
- Section-by-section dynamics with specific dB/loudness targets (verse: -18 LUFS, chorus: -12 LUFS)
- Tension mapping: identify the emotional peak, the quiet moment, the build, the release
- Contrast ratios: how much louder/denser/brighter each section is relative to the previous
</techniques_to_apply>
<output_length>Comprehensive, production-grade prompt (400-700 words of dense musical specification)</output_length>`;
  }
}

function getOutputFormat(tier: EnhancementTier, subModality?: AudioSubModality): string {
  if (subModality === 'lyrics') {
    return `<output_rules>
CRITICAL: Return ONLY the enhanced lyrics. No explanations or preamble.

CHARACTER LIMIT: The entire lyrics output MUST stay under 3000 characters. Count characters carefully and trim if needed.

Format requirements:
- Start every section with a [Structure Tag] on its own line
- Use vocal delivery tags inline: [Whisper], [Rap], [Falsetto], [Belting], etc.
- Use vocal type tags for voice assignment: [Male Vocal], [Female Vocal], [Duet]
- Keep lines to 8-12 syllables (verses), shorter for choruses/hooks
- Use consistent rhyme scheme throughout (AABB, ABAB, or ABCB)
- Paste chorus lyrics in FULL at every chorus — never abbreviate
- Include parenthetical performance directions where needed: (guitar solo), (spoken), (building intensity)
- Add [Intro] and [Outro] with instrumental descriptions
- Use punctuation intentionally: ellipses for pauses, hyphens for elongation, exclamation for intensity
</output_rules>`;
  }

  return `<output_rules>
CRITICAL: Return ONLY the enhanced audio prompt. No explanations or preamble.

LENGTH CONSTRAINTS:
- Music style/description prompts MUST stay under 500 characters. Use dense, keyword-style descriptors.
- Lyrics MUST stay under 3000 characters total.
- These limits ensure compatibility with all major AI music generators.

Format requirements:
- Start with [Genre:], [Tempo:], [Key:], [Mood:] header block
- Use [Structure Tags] for all sections${tier === 'advanced' ? ' with bar counts and transition descriptions' : ''}
- Include instrumentation details with sonic roles
- Describe vocal characteristics when applicable (or specify "instrumental only")
- End with production/mixing notes
- Use sophisticated musical vocabulary throughout
- If the user specifies a character or word limit in their prompt, that constraint overrides all other length guidance
</output_rules>`;
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const audioModalityConfig: ModalityConfig = {
  modality: 'audio',
  displayName: 'Audio Generation',
  description: 'Optimized for AI audio and music generation',
  targetPlatforms: ['general'],
  subModalities: ['music', 'lyrics', 'speech', 'soundscape', 'voiceover'],
  defaultSubModality: 'music',
  coreStructure: [
    'Genre, subgenre, and reference artists',
    'Tempo (BPM), key, and time signature',
    'Mood with sophisticated vocabulary',
    'Instrumentation with sonic roles',
    'Structure with section tags',
    'Dynamic arc with tension/release',
    'Vocal specification (or instrumental)',
    'Production style and era reference',
  ],
  domainTechniques: [
    'Structure tags for organized song sections ([Verse], [Chorus], [Drop], etc.)',
    'BPM and key specification anchoring the musical foundation',
    'Reference artist anchoring for style (describe sonic qualities)',
    'Dynamic progression mapping (pp→fff, quiet verse→explosive chorus)',
    'Instrumentation layering with entry/exit points',
    'Production era/style references (80s gated reverb, lo-fi tape warmth, modern radio-ready)',
    'Vocal delivery tags for lyrics ([Whisper], [Rap], [Falsetto], [Belting])',
    'Sophisticated emotional vocabulary (euphoric > happy, melancholic > sad)',
    'Character-optimized output (music style under 500 chars, lyrics under 3000 chars)',
    'Negative specifications for excluding unwanted elements',
  ],
  fewShotExamples,
  negativeExamples,
  constraints,
  buildSystemPrompt,
};
