export default function SDKsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-primary mb-2 text-3xl font-bold">SDKs & Examples</h1>
        <p className="text-muted text-lg">Code examples in popular programming languages.</p>
      </div>

      {/* Python */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Python</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`import os
import requests

API_KEY = os.environ.get("PROMPTOMIZE_API_KEY")
BASE_URL = "https://api.promptomize.app/api/v1"

def enhance_prompt(prompt, modality="text", tone=None, length=None):
    """Enhance a prompt using the Promptomize API."""
    response = requests.post(
        f"{BASE_URL}/public/enhance",
        headers={"X-API-Key": API_KEY},
        json={
            "prompt": prompt,
            "modality": modality,
            "tone": tone,
            "length": length,
        }
    )
    response.raise_for_status()
    return response.json()

# Example usage
result = enhance_prompt(
    "Write a professional email",
    modality="text",
    tone="professional"
)
print(result["enhancedPrompt"])`}
          </pre>
        </div>
      </section>

      {/* JavaScript/TypeScript */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">JavaScript / TypeScript</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`const API_KEY = process.env.PROMPTOMIZE_API_KEY;
const BASE_URL = "https://api.promptomize.app/api/v1";

interface EnhanceOptions {
  prompt: string;
  modality?: "text" | "image" | "video" | "audio" | "code" | "3d";
  tone?: string;
  length?: string;
}

async function enhancePrompt(options: EnhanceOptions) {
  const response = await fetch(\`\${BASE_URL}/public/enhance\`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}

// Example usage
const result = await enhancePrompt({
  prompt: "Write a professional email",
  modality: "text",
  tone: "professional",
});
console.log(result.enhancedPrompt);`}
          </pre>
        </div>
      </section>

      {/* cURL */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">cURL</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`# Basic request
curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: $PROMPTOMIZE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Write a professional email", "modality": "text"}'

# With all options
curl -X POST https://api.promptomize.app/api/v1/public/enhance \\
  -H "X-API-Key: $PROMPTOMIZE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a professional email to schedule a meeting",
    "modality": "text",
    "tone": "professional",
    "length": "detailed",
    "customInstructions": "Include a clear subject line"
  }'

# Check usage
curl https://api.promptomize.app/api/v1/public/usage \\
  -H "X-API-Key: $PROMPTOMIZE_API_KEY"`}
          </pre>
        </div>
      </section>

      {/* Go */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Go</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "os"
)

const baseURL = "https://api.promptomize.app/api/v1"

type EnhanceRequest struct {
    Prompt   string \`json:"prompt"\`
    Modality string \`json:"modality,omitempty"\`
    Tone     string \`json:"tone,omitempty"\`
}

type EnhanceResponse struct {
    EnhancedPrompt string \`json:"enhancedPrompt"\`
}

func enhancePrompt(req EnhanceRequest) (*EnhanceResponse, error) {
    body, _ := json.Marshal(req)

    httpReq, _ := http.NewRequest("POST", baseURL+"/public/enhance", bytes.NewBuffer(body))
    httpReq.Header.Set("X-API-Key", os.Getenv("PROMPTOMIZE_API_KEY"))
    httpReq.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result EnhanceResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}`}
          </pre>
        </div>
      </section>

      {/* PHP */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">PHP</h2>
        <div className="bg-secondary overflow-hidden rounded-lg">
          <pre className="text-primary overflow-x-auto p-4 text-sm">
            {`<?php
$apiKey = getenv('PROMPTOMIZE_API_KEY');
$baseUrl = 'https://api.promptomize.app/api/v1';

function enhancePrompt($prompt, $modality = 'text', $tone = null) {
    global $apiKey, $baseUrl;

    $data = [
        'prompt' => $prompt,
        'modality' => $modality,
    ];
    if ($tone) $data['tone'] = $tone;

    $ch = curl_init($baseUrl . '/public/enhance');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'X-API-Key: ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($data),
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Usage
$result = enhancePrompt('Write a professional email', 'text', 'professional');
echo $result['enhancedPrompt'];`}
          </pre>
        </div>
      </section>

      {/* Next Steps */}
      <section className="space-y-4">
        <h2 className="text-primary text-2xl font-semibold">Resources</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <a
            href="https://github.com/promptomize/api-examples"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">GitHub Examples</h3>
            <p className="text-muted mt-1 text-sm">Full example projects</p>
          </a>
          <a
            href="/api/v1/docs/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:border-accent rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-primary font-medium">OpenAPI Spec</h3>
            <p className="text-muted mt-1 text-sm">Generate your own SDK</p>
          </a>
        </div>
      </section>
    </div>
  )
}
