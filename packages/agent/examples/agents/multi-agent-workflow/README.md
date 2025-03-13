# Multi-agent Workflow

A sequential agentic workflow that calls two agents to create blog post content.

## Prerequisites

- Node.js (>=18)
- Bun (recommended)
- OpenAI API key

## Installation

1. Clone the repository and navigate to the project directory:

   ```bash
   git clone https://github.com/mastra-ai/mastra
   cd examples/basics/agents/agents-as-tools
   ```

2. Copy the environment variables file and add your OpenAI API key:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your OpenAI API key:

   ```env
   OPENAI_API_KEY=your-api-key
   ```

3. Install dependencies:

   ```bash
   bun install
   ```

## Running the Example

1. Start the example:

   ```bash
   bun start
   ```
