export default function ModelsEndpointPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded text-xs font-medium">
            GET
          </span>
          <code className="text-lg text-primary">/public/models</code>
        </div>
        <p className="text-lg text-muted">List available modalities, tones, and configuration options.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Example Request</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`curl https://api.promptomize.app/api/v1/public/models \\
  -H "X-API-Key: pk_live_your_api_key"`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Response</h2>
        <div className="rounded-lg bg-secondary overflow-hidden">
          <pre className="p-4 text-sm text-primary overflow-x-auto">
{`{
  "modalities": [
    { "id": "text", "name": "Text", "description": "General text and writing" },
    { "id": "image", "name": "Image", "description": "Image generation prompts" },
    { "id": "video", "name": "Video", "description": "Video generation prompts" },
    { "id": "audio", "name": "Audio", "description": "Audio/music prompts" },
    { "id": "code", "name": "Code", "description": "Programming assistance" },
    { "id": "3d", "name": "3D", "description": "3D model generation" }
  ],
  "tones": [
    { "id": "professional", "name": "Professional" },
    { "id": "casual", "name": "Casual" },
    { "id": "academic", "name": "Academic" },
    { "id": "creative", "name": "Creative" },
    { "id": "technical", "name": "Technical" },
    { "id": "friendly", "name": "Friendly" }
  ],
  "lengths": [
    { "id": "concise", "name": "Concise" },
    { "id": "standard", "name": "Standard" },
    { "id": "detailed", "name": "Detailed" }
  ],
  "limits": {
    "maxPromptLength": 100000,
    "maxTokens": 8192,
    "maxCustomInstructions": 2000
  }
}`}
          </pre>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-primary">Modalities</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 'text', name: 'Text', desc: 'General writing, emails, articles' },
            { id: 'image', name: 'Image', desc: 'Image generation platforms' },
            { id: 'video', name: 'Video', desc: 'Video generation platforms' },
            { id: 'audio', name: 'Audio', desc: 'Music generation platforms' },
            { id: 'code', name: 'Code', desc: 'Programming and development' },
            { id: '3d', name: '3D', desc: '3D model generation' },
          ].map((m) => (
            <div key={m.id} className="rounded-lg border border-border p-4">
              <code className="text-sm text-accent">{m.id}</code>
              <h3 className="font-medium text-primary mt-1">{m.name}</h3>
              <p className="text-sm text-muted mt-1">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
