"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

interface WorkerStatus {
  queue: string;
  email: string;
}

export default function WorkerPage() {
  const [status, setStatus] = useState<WorkerStatus>({ queue: "unknown", email: "unknown" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      checkStatus();
    }
  }, []);

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const checkStatus = async () => {
    const res = await fetch("/api/worker?action=status");
    const data = await res.json();
    setStatus(data);
  };

  const handleAction = async (worker: "queue" | "email", action: "start" | "stop") => {
    setLoading(true);
    try {
      await fetch(`/api/worker?worker=${worker}&action=${action}`);
      await checkStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 text-sm text-muted-foreground">
        Development Mode Only
      </div>
      
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold mb-2">Queue Worker</h2>
          <h3>Status: {status.queue}</h3>
          <div className="flex gap-4 mt-4">
            <Button 
              onClick={() => handleAction("queue", "start")}
              disabled={loading || status.queue === "running"}
            >
              Start Queue Worker
            </Button>
            <Button 
              onClick={() => handleAction("queue", "stop")}
              disabled={loading || status.queue === "stopped"}
            >
              Stop Queue Worker
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Email Worker</h2>
          <h3>Status: {status.email}</h3>
          <div className="flex gap-4 mt-4">
            <Button 
              onClick={() => handleAction("email", "start")}
              disabled={loading || status.email === "running"}
            >
              Start Email Worker
            </Button>
            <Button 
              onClick={() => handleAction("email", "stop")}
              disabled={loading || status.email === "stopped"}
            >
              Stop Email Worker
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 