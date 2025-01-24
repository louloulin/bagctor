import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectForm } from '../components/connect-form';
import { ChatView } from '../components/chat-view';
import '../styles/globals.css';

declare global {
  function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}

// Get VSCode API
const vscode = acquireVsCodeApi();

interface Message {
  type: 'chat' | 'response' | 'connect' | 'disconnect';
  content?: string;
  username?: string;
  peerAddress?: string;
}

function App() {
  const [isConnected, setIsConnected] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [username, setUsername] = React.useState('');
  const [systemAddress, setSystemAddress] = React.useState('');

  React.useEffect(() => {
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          setUsername(message.username);
          setSystemAddress(message.systemAddress);
          break;
        case 'connect':
        case 'disconnect':
        case 'chat':
        case 'response':
          setMessages(prev => [...prev, message]);
          if (message.type === 'connect') {
            setIsConnected(true);
          } else if (message.type === 'disconnect') {
            setIsConnected(false);
          }
          break;
      }
    });
  }, []);

  const handleConnect = (address: string) => {
    vscode.postMessage({
      type: 'connect',
      address
    });
  };

  const handleSendMessage = (content: string) => {
    vscode.postMessage({
      type: 'chat',
      content
    });
  };

  return (
    <div className="p-4 h-screen bg-background text-foreground">
      {!isConnected ? (
        <ConnectForm onConnect={handleConnect} systemAddress={systemAddress} />
      ) : (
        <ChatView
          messages={messages}
          onSendMessage={handleSendMessage}
          username={username}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />); 