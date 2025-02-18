"use client";

import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const { toast } = useToast();

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Transcript copied to clipboard",
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copy}
      className="gap-2"
    >
      <Copy className="h-4 w-4" />
      Copy transcript
    </Button>
  );
} 