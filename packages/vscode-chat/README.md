# VSCode Bactor Chat Extension

A high-performance chat plugin for VSCode powered by Bactor actor system.

## Features

- Real-time chat interface in VSCode
- High-performance message handling using the Bactor actor system
- Modern and clean UI that matches VSCode's theme
- P2P communication using Bactor's actor system
- Support for multiple chat rooms
- User presence notifications (join/leave)

## Development

### Prerequisites

- Node.js 16 or higher
- Bun package manager
- VSCode

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Build the extension:
   ```bash
   bun run build
   ```

4. Launch the extension in development mode:
   - Press F5 in VSCode to start debugging
   - Or run the "Launch Extension" configuration

### Commands

- `Start Bactor Chat`: Opens the chat interface in the activity bar
- `Connect to Peer`: Connect to another chat peer by entering their address

## Building and Packaging

### Development Build

To build the extension for development:

```bash
bun run build
```

To watch for changes and rebuild automatically:

```bash
bun run watch
```

### Production Build

To create a production build:

```bash
bun run compile
```

### Creating VSIX Package

To create a VSIX package for distribution:

```bash
bun run package
```

This will create a `.vsix` file in the root directory that can be installed in VSCode.

### Publishing

To publish the extension to the VSCode Marketplace:

1. Make sure you have a publisher account and are logged in:
   ```bash
   vsce login <publisher>
   ```

2. Publish the extension:
   ```bash
   bun run publish
   ```

## Testing

To run the tests:

```bash
bun run test
```

## Usage

1. Install the extension from the VSCode Marketplace
2. Open the command palette (Ctrl+Shift+P)
3. Run "Start Bactor Chat" to open the chat interface
4. Enter your username when prompted
5. To connect to other peers:
   - Run "Connect to Peer" from the command palette
   - Enter the peer's address (e.g., localhost:3000)
6. Start chatting!

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
