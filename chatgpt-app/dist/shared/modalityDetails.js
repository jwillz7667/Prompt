export const modalityDetails = {
    text: {
        name: 'Text',
        description: 'Refine prompts for writing, research, analysis, chat, and general assistant workflows.',
        placeholder: "Paste the text task you want improved. Example: 'Write a launch email for a new AI feature aimed at product managers.'",
        example: 'Draft a concise but confident investor update about strong quarterly growth.',
        helper: 'Best when you want stronger structure, audience targeting, tone, and output instructions.',
    },
    image: {
        name: 'Image',
        description: 'Refine prompts for image generators with better subject, composition, lighting, style, and camera cues.',
        placeholder: "Paste the scene you want improved. Example: 'A luxury perfume bottle on black marble with dramatic rim lighting.'",
        example: 'Cinematic studio portrait of a founder at a glowing workstation, editorial style.',
        helper: 'Useful for Midjourney, DALL-E, Flux, and other image-generation tools.',
    },
    video: {
        name: 'Video',
        description: 'Refine prompts for motion, pacing, camera movement, shot progression, and cinematic direction.',
        placeholder: "Paste the video concept you want improved. Example: 'A futuristic sports car drifting through neon Tokyo for a short ad.'",
        example: 'Slow dolly-in through a misty forest temple at sunrise with drifting particles.',
        helper: 'Useful for Sora, Runway, Kling, Pika, and similar video-generation workflows.',
    },
    audio: {
        name: 'Audio',
        description: 'Refine prompts for music, lyrics, voice, ambience, and sound-design workflows.',
        placeholder: "Paste the audio concept you want improved. Example: 'An uplifting synth-pop anthem with glossy 80s production.'",
        example: 'Warm cinematic voiceover with calm pacing over a spacious ambient bed.',
        helper: 'Useful for music generation, lyrics, voice synthesis, and podcast-style scripting.',
    },
    code: {
        name: 'Code',
        description: 'Refine prompts for implementation work with clearer requirements, constraints, architecture, and tests.',
        placeholder: "Paste the coding task you want improved. Example: 'Build a secure Express auth API with JWT refresh tokens and tests.'",
        example: 'Create a React pricing table component with keyboard accessibility and unit tests.',
        helper: 'Useful for implementation, refactors, debugging, API design, and UI component generation.',
    },
    '3d': {
        name: '3D',
        description: 'Refine prompts for 3D assets, renders, materials, topology, scale, and production constraints.',
        placeholder: "Paste the 3D concept you want improved. Example: 'A stylized medieval sword game asset with worn steel and leather grip.'",
        example: 'Low-poly sci-fi drone asset with modular panels and emissive accents for a game scene.',
        helper: 'Useful for asset ideation, visualization, rendering, and 3D-printing preparation.',
    },
};
export function getModalityDetail(modality) {
    return modalityDetails[modality];
}
export function enrichModalityCapabilities(modalities) {
    return modalities.map((item) => {
        const detail = modalityDetails[item.id];
        if (!detail || item.description) {
            return item;
        }
        return {
            ...item,
            description: detail.description,
        };
    });
}
