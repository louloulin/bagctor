import * as React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

interface ConnectFormProps {
  onConnect: (address: string) => void;
  systemAddress: string;
}

export function ConnectForm({ onConnect, systemAddress }: ConnectFormProps) {
  const [address, setAddress] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address) {
      onConnect(address);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect to Peer</CardTitle>
        <CardDescription>
          Your system address is: {systemAddress}
          <br />
          Share this address with others to let them connect to you.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="address">Peer Address</Label>
              <Input
                id="address"
                placeholder="Enter peer address (e.g., localhost:3000)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={!address}>
            Connect
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
} 