import * as React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';

interface Message {
  type: 'chat' | 'response' | 'connect' | 'disconnect';
  content?: string;
  username?: string;
}

interface ChatViewProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  username: string;
}

export function ChatView({ messages, onSendMessage, username }: ChatViewProps) {
  const [message, setMessage] = React.useState('');
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <CardTitle>Bactor Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-12rem)]">
          <div className="space-y-4 p-4">
            {messages.map((msg, i) => {
              if (msg.type === 'connect' || msg.type === 'disconnect') {
                return (
                  <div key={i} className="text-center text-sm text-muted-foreground">
                    {msg.username} has {msg.type === 'connect' ? 'joined' : 'left'} the chat
                  </div>
                );
              }

              const isCurrentUser = msg.username === username;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    isCurrentUser ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {msg.username?.[0]?.toUpperCase() || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`rounded-lg px-3 py-2 max-w-[80%] ${
                      isCurrentUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">{msg.username}</div>
                    <div className="text-sm">{msg.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Input
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" disabled={!message.trim()}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
} 